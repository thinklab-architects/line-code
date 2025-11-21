import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const BASE_URL = 'https://www.kaa.org.tw';
const LIST_URL = `${BASE_URL}/law_list.php`;
const DETAIL_DELAY_MS = 200;
const DETAIL_CONCURRENCY = Math.max(
  1,
  Number.isFinite(Number(process.env.DETAIL_CONCURRENCY))
    ? Number(process.env.DETAIL_CONCURRENCY)
    : 2,
);
const MAX_LIST_PAGES = Number.isFinite(Number(process.env.FETCH_MAX_PAGES))
  ? Number(process.env.FETCH_MAX_PAGES)
  : Infinity;

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Referer: 'https://www.kaa.org.tw/',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function cleanText(value) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeLabel(value) {
  return cleanText(value).replace(/[:：]/g, '');
}

function absoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, LIST_URL).href;
  } catch {
    return null;
  }
}

function buildListUrl(pageNumber = 1) {
  if (!pageNumber || pageNumber === 1) {
    return LIST_URL;
  }

  const url = new URL(LIST_URL);
  url.searchParams.set('b', String(pageNumber));
  return url.toString();
}

function parseRepublicYear(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric >= 1900) {
    return numeric;
  }

  return numeric + 1911;
}

function parseDateValue(value) {
  const normalized = cleanText(value);
  const parts = normalized.match(/\d+/g);
  if (!parts || parts.length === 0) {
    return null;
  }

  let [year, month = '1', day = '1'] = parts;
  const gregorianYear = parseRepublicYear(year);
  if (!gregorianYear) {
    return null;
  }

  return `${gregorianYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parsePagination($) {
  const summary = cleanText($('.quantity .q_box2').text());
  const totalMatch = summary.match(/資料筆數：(\d+)/);
  const pageMatch = summary.match(/頁數：(\d+)\/(\d+)/);

  return {
    totalRecords: totalMatch ? Number(totalMatch[1]) : null,
    currentPage: pageMatch ? Number(pageMatch[1]) : 1,
    totalPages: pageMatch ? Number(pageMatch[2]) : 1,
  };
}

function parseList(html) {
  const $ = load(html);
  const table = $('.mtable table').first();

  if (!table.length) {
    throw new Error('Unable to locate the law listing table.');
  }

  const documents = [];

  table
    .find('tr')
    .slice(1)
    .each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 4) {
        return;
      }

      const year = cleanText($(cells[0]).text());
      const serial = cleanText($(cells[1]).text());
      const titleCell = $(cells[2]);
      const subjectAnchor = titleCell.find('a').first();
      const subjectUrl = absoluteUrl(subjectAnchor.attr('href'));
      const subject =
        cleanText(subjectAnchor.find('div').attr('title')) ||
        cleanText(subjectAnchor.text()) ||
        cleanText(titleCell.text());
      const category = cleanText($(cells[3]).text());

      documents.push({
        year,
        serial,
        category,
        subject,
        subjectUrl,
      });
    });

  return {
    documents,
    pagination: parsePagination($),
  };
}

function parseDetail(html) {
  const $ = load(html);
  const rows = $('.addtable table tr');

  if (!rows.length) {
    throw new Error('Unable to parse detail page content.');
  }

  const record = {
    attachments: [],
    relatedLinks: [],
  };

  rows.each((_, row) => {
    const header = normalizeLabel($(row).find('th').first().text());
    const valueCell = $(row).find('td').first();
    if (!header || !valueCell.length) {
      return;
    }

    const valueText = cleanText(valueCell.text());

    switch (header) {
      case '法規年度':
        record.lawYearLabel = valueText;
        record.lawYear = Number(valueText.replace(/[^\d]/g, '')) || null;
        break;
      case '發文單位':
        record.issuer = valueText;
        break;
      case '發文日期':
        record.date = parseDateValue(valueCell.text()) ?? valueText;
        break;
      case '發文字號':
        record.documentNumber = valueText;
        break;
      case '條文編號':
        record.articleNumber = valueText;
        break;
      case '條文主旨':
        record.subject = valueText || record.subject;
        break;
      case '條文內容':
        record.content = valueText;
        break;
      case '相關檔案': {
        const attachments = [];
        valueCell.find('a').each((__, link) => {
          const href = absoluteUrl($(link).attr('href'));
          if (!href) {
            return;
          }

          attachments.push({
            label: cleanText($(link).text()) || '附件',
            url: href,
          });
        });
        if (attachments.length) {
          record.attachments = attachments;
        }
        break;
      }
      case '相關網址': {
        const links = [];
        valueCell.find('a').each((__, link) => {
          const href = absoluteUrl($(link).attr('href'));
          if (!href) {
            return;
          }

          links.push({
            label: cleanText($(link).text()) || href,
            url: href,
          });
        });
        if (links.length) {
          record.relatedLinks = links;
        }
        break;
      }
      default:
        break;
    }
  });

  return record;
}

async function fetchAllListPages() {
  const documents = [];
  let totalPages = 1;

  for (let page = 1; page <= totalPages; page += 1) {
    if (page > MAX_LIST_PAGES) {
      console.log(`Reached page cap (${MAX_LIST_PAGES}), stopping early.`);
      break;
    }

    const url = buildListUrl(page);
    let entries = [];
    let pagination = { totalPages };

    try {
      const html = await fetchPage(url);
      const parsed = parseList(html);
      entries = parsed.documents;
      pagination = parsed.pagination;
    } catch (error) {
      console.warn(`Skip page ${page}: ${error.message}`);
      continue;
    }

    if (page === 1 && pagination.totalRecords) {
      console.log(
        `Listing summary: ${pagination.totalRecords} records across ${pagination.totalPages} pages.`,
      );
    }

    totalPages = pagination.totalPages ?? totalPages;
    documents.push(...entries);
    console.log(`Parsed page ${page}/${totalPages} (${entries.length} records)`);
  }

  return documents;
}

async function enrichWithDetails(documents) {
  const results = new Array(documents.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= documents.length) {
        break;
      }

      const entry = documents[currentIndex];
      let detail = {
        attachments: [],
        relatedLinks: [],
      };

      if (entry.subjectUrl) {
        try {
          const detailHtml = await fetchPage(entry.subjectUrl);
          detail = parseDetail(detailHtml);
        } catch (error) {
          console.warn(`Unable to parse detail page ${entry.subjectUrl}:`, error.message);
        }
      }

      results[currentIndex] = {
        ...entry,
        ...detail,
      };

      if ((currentIndex + 1) % 100 === 0) {
        console.log(`Processed ${currentIndex + 1}/${documents.length} detail pages`);
      }

      if (DETAIL_DELAY_MS > 0) {
        await sleep(DETAIL_DELAY_MS);
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(DETAIL_CONCURRENCY, documents.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

async function fetchDocuments() {
  const documents = await fetchAllListPages();
  console.log(`Collected ${documents.length} list entries, fetching detail pages...`);
  return enrichWithDetails(documents);
}

async function writeData(documents) {
  const outDir = path.resolve(__dirname, '../docs/data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'documents.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({ documents, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  return outPath;
}

async function main() {
  try {
    const documents = await fetchDocuments();
    const outPath = await writeData(documents);
    console.log(`Saved ${documents.length} law records to ${outPath}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

main();
