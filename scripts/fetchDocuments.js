import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const BASE_URL = 'https://www.kaa.org.tw';
const LIST_URL = `${BASE_URL}/law_list.php`;
const MAX_RECORDS = 25;
const DETAIL_DELAY_MS = 250;

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
  return new URL(value, LIST_URL).href;
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

  return documents.slice(0, MAX_RECORDS);
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

async function fetchDocuments() {
  const html = await fetchPage(LIST_URL);
  const list = parseList(html);
  const documents = [];

  for (const entry of list) {
    let detail = {
      attachments: [],
      relatedLinks: [],
    };

    if (entry.subjectUrl) {
      try {
        const detailHtml = await fetchPage(entry.subjectUrl);
        detail = parseDetail(detailHtml);
        await sleep(DETAIL_DELAY_MS);
      } catch (error) {
        console.warn(`Unable to parse detail page ${entry.subjectUrl}:`, error.message);
      }
    }

    documents.push({
      ...entry,
      ...detail,
    });
  }

  return documents;
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
