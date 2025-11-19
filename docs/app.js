const DATA_URL = './data/documents.json';
const DEADLINE_SOON_DAYS = 7;
const RECENT_ISSUED_DAYS = 14;
const ACTIVE_ISSUED_DAYS = 90;
const BADGE_TEXT = {
  'due-soon': '最新',
  active: '近期',
  expired: '較早',
  'no-deadline': '無日期',
};

const DEFAULT_STATUS_VALUES = ['due-soon', 'active', 'no-deadline'];

const state = {
  documents: [],
  filtered: [],
  filters: {
    search: '',
    sort: 'date-desc',
    statuses: new Set(DEFAULT_STATUS_VALUES),
  },
};

const serialCollator = new Intl.Collator('zh-Hant', {
  numeric: true,
  sensitivity: 'base',
});

bootstrapLayout();

const elements = {
  status: document.getElementById('status'),
  documentList: document.getElementById('documentList'),
  searchInput: document.getElementById('search'),
  sortSelect: document.getElementById('sortSelect'),
  clearFilters: document.getElementById('clearFilters'),
  updatedAt: document.getElementById('updatedAt'),
};

const statusCheckboxes = Array.from(
  document.querySelectorAll('input[name="statusFilter"]'),
);

function syncStatusCheckboxes() {
  statusCheckboxes.forEach((checkbox) => {
    checkbox.checked = state.filters.statuses.has(checkbox.value);
  });
}

function resetStatusFilters() {
  state.filters.statuses = new Set(DEFAULT_STATUS_VALUES);
  syncStatusCheckboxes();
}

statusCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    const { value, checked } = checkbox;

    if (checked) {
      state.filters.statuses.add(value);
    } else {
      state.filters.statuses.delete(value);
      if (state.filters.statuses.size === 0) {
        state.filters.statuses.add(value);
        checkbox.checked = true;
        return;
      }
    }

    render();
  });
});

syncStatusCheckboxes();

elements.searchInput.addEventListener('input', (event) => {
  state.filters.search = event.target.value.trim();
  render();
});

elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (elements.searchInput.value) {
      elements.searchInput.value = '';
      state.filters.search = '';
      render();
    }
  }
});


elements.sortSelect.addEventListener('change', (event) => {
  state.filters.sort = event.target.value;
  render();
});

elements.clearFilters.addEventListener('click', () => {
  const hasSearch = Boolean(state.filters.search);
  const hasSort = state.filters.sort !== 'date-desc';
  const hasStatusChange =
    state.filters.statuses.size !== DEFAULT_STATUS_VALUES.length ||
    DEFAULT_STATUS_VALUES.some((value) => !state.filters.statuses.has(value));

  if (!hasSearch && !hasSort && !hasStatusChange) {
    return;
  }

  state.filters.search = '';
  state.filters.sort = 'date-desc';
  resetStatusFilters();

  elements.searchInput.value = '';
  elements.sortSelect.value = 'date-desc';

  render();
});

loadDocuments();

function bootstrapLayout() {
  document.title = '高雄建築師公會法規紀錄';
  const template = document.createElement('template');
  template.innerHTML = `
    <div class="top-bar shell">
      <div class="top-bar__search">
        <label class="sr-only" for="search">搜尋條文、機關或字號</label>
        <input
          id="search"
          type="search"
          placeholder="搜尋條文、機關或字號"
          autocomplete="off"
        />
      </div>
    </div>

    <header class="hero">
      <div class="shell hero__inner">
        <div class="hero__lede">
          <p class="hero__eyebrow"><span class="hero__eyebrow-abbr">KAA</span>法規專區</p>
          <h1 class="hero__title">法規訊息紀錄</h1>
          <p class="hero__description">
            每日擷取高雄市建築師公會「法規訊息」，彙整附件、條文與相關連結，方便快速檢索。
          </p>
          <div class="hero__actions">
            <a
              class="hero__link"
              href="https://www.kaa.org.tw/law_list.php"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看官方列表
            </a>
          </div>
        </div>
      </div>
    </header>

    <main class="shell flow">
      <section class="controls" aria-label="篩選與排序">
        <fieldset class="status-group">
          <legend class="field-label">顯示時間範圍</legend>
          <label class="status-option">
            <input type="checkbox" name="statusFilter" value="due-soon" checked />
            <span>最新（14 天內）</span>
          </label>
          <label class="status-option">
            <input type="checkbox" name="statusFilter" value="active" checked />
            <span>近期（三個月內）</span>
          </label>
          <label class="status-option">
            <input type="checkbox" name="statusFilter" value="expired" />
            <span>較早</span>
          </label>
          <label class="status-option">
            <input type="checkbox" name="statusFilter" value="no-deadline" checked />
            <span>未備日期</span>
          </label>
        </fieldset>

        <div class="field-group">
          <label class="field-label" for="sortSelect">排序方式</label>
          <select id="sortSelect">
            <option value="date-desc">最新發布在前</option>
            <option value="date-asc">最早發布在前</option>
            <option value="serial-desc">條文編號由大到小</option>
            <option value="serial-asc">條文編號由小到大</option>
          </select>
        </div>

        <button id="clearFilters" type="button">重設條件</button>
      </section>

      <section aria-live="polite">
        <div id="status" class="status">資料載入中...</div>
        <div id="documentList" class="document-grid" hidden></div>
      </section>
    </main>

    <footer class="app-footer">
      <div class="shell footer-inner">
        <p class="footer-copy">
          資料來源：
          <a
            href="https://www.kaa.org.tw/law_list.php"
            target="_blank"
            rel="noopener noreferrer"
          >高雄市建築師公會・法規訊息</a>
          ｜GitHub Pages 自動更新。
        </p>
        <p id="updatedAt" class="footer-updated" aria-live="polite">資料更新：尚未更新</p>
      </div>
    </footer>

    <script type="module" src="./app.js"></script>
  `;
  document.body.replaceChildren(template.content.cloneNode(true));
}

function formatUpdatedAt(isoString) {
  if (!isoString) return '資料更新：尚未更新';

  const formatter = new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  });

  try {
    return `資料更新：${formatter.format(new Date(isoString))}`;
  } catch {
    return `資料更新：${isoString}`;
  }
}


function parseDate(value) {
  if (!value) return null;

  const normalized = value.trim().replace(/\//g, '-');
  const isoCandidate =
    normalized.length === 10
      ? `${normalized}T00:00:00+08:00`
      : normalized;

  const parsed = new Date(isoCandidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const taipeiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getTaipeiToday() {
  const formatted = taipeiDateFormatter.format(Date.now());
  return parseDate(formatted);
}

function enrichDocument(doc) {
  const issuedDate = parseDate(doc.date);
  const deadlineDate = parseDate(doc.deadline);
  const today = getTaipeiToday();

  let deadlineCategory = 'no-deadline';
  let daysUntilDeadline = null;
   let daysSinceIssued = null;

  if (deadlineDate && today) {
    const diffDays = Math.floor(
      (deadlineDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    );
    daysUntilDeadline = diffDays;

    if (diffDays < 0) {
      deadlineCategory = 'expired';
    } else if (diffDays <= DEADLINE_SOON_DAYS) {
      deadlineCategory = 'due-soon';
    } else {
      deadlineCategory = 'active';
    }
  } else if (issuedDate && today) {
    const diffDays = Math.floor(
      (today.getTime() - issuedDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    daysSinceIssued = diffDays >= 0 ? diffDays : 0;

    if (diffDays <= RECENT_ISSUED_DAYS) {
      deadlineCategory = 'due-soon';
    } else if (diffDays <= ACTIVE_ISSUED_DAYS) {
      deadlineCategory = 'active';
    } else {
      deadlineCategory = 'expired';
    }
  }

  return {
    ...doc,
    issuedDate,
    deadlineDate,
    deadlineCategory,
    daysUntilDeadline,
    daysSinceIssued,
  };
}

function formatDeadlineNote(doc) {
  if (doc.daysUntilDeadline != null) {
    if (doc.daysUntilDeadline < 0) {
      return `逾期 ${Math.abs(doc.daysUntilDeadline)} 天`;
    }

    if (doc.daysUntilDeadline === 0) {
      return '今天截止';
    }

    return `剩餘 ${doc.daysUntilDeadline} 天`;
  }

  if (doc.daysSinceIssued != null) {
    if (doc.daysSinceIssued === 0) {
      return '今日發布';
    }

    return `發布 ${doc.daysSinceIssued} 天`;
  }

  return '尚未提供日期';
}

function sortDocuments(documents) {
  const sorted = [...documents];

  const compareDate = (a, b, key, direction = 'desc') => {
    const aDate = a[key];
    const bDate = b[key];

    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;

    const diff = aDate.getTime() - bDate.getTime();
    return direction === 'asc' ? diff : -diff;
  };

  const compareSerial = (direction = 'asc') => (a, b) => {
    const aValue = a.articleNumber ?? a.serial ?? '';
    const bValue = b.articleNumber ?? b.serial ?? '';
    const comparison = serialCollator.compare(aValue, bValue);
    return direction === 'asc' ? comparison : -comparison;
  };

  switch (state.filters.sort) {
    case 'date-asc':
      sorted.sort((a, b) => compareDate(a, b, 'issuedDate', 'asc'));
      break;
    case 'serial-asc':
      sorted.sort(compareSerial('asc'));
      break;
    case 'serial-desc':
      sorted.sort(compareSerial('desc'));
      break;
    case 'date-desc':
    default:
      sorted.sort((a, b) => compareDate(a, b, 'issuedDate', 'desc'));
      break;
  }

  return sorted;
}

function applyFilters() {
  const query = state.filters.search.toLowerCase();

  let results = state.documents;

  if (query) {
    results = results.filter((doc) => {
      const subject = doc.subject?.toLowerCase() ?? '';
      const url = doc.subjectUrl?.toLowerCase() ?? '';
      const attachments = (doc.attachments || [])
        .map(
          (attachment) =>
            `${attachment.label ?? ''} ${(attachment.url ?? '').toLowerCase()}`,
        )
        .join(' ');

      const relatedLinks = (doc.relatedLinks || [])
        .map(
          (link) =>
            `${link.label ?? ''} ${(link.url ?? '').toLowerCase()}`,
        )
        .join(' ');

      const searchable = [
        subject,
        url,
        attachments,
        relatedLinks,
        doc.category?.toLowerCase() ?? '',
        doc.issuer?.toLowerCase() ?? '',
        doc.documentNumber?.toLowerCase() ?? '',
        doc.articleNumber?.toLowerCase() ?? '',
        doc.serial?.toLowerCase() ?? '',
        doc.content?.toLowerCase() ?? '',
        (doc.date ?? '').toLowerCase(),
        (doc.deadline ?? '').toLowerCase(),
      ];

      return (
        searchable.some((value) => value?.includes(query))
      );
    });
  }

  if (state.filters.statuses.size) {
    results = results.filter((doc) =>
      state.filters.statuses.has(doc.deadlineCategory ?? 'no-deadline'),
    );
  }

  return sortDocuments(results);
}

function updateStatus(filtered, total) {
  elements.status.classList.remove('status--error');

  if (total === 0) {
    elements.status.textContent = '目前尚未取得法規紀錄，請稍候重試。';
    return;
  }

  if (filtered === 0) {
    elements.status.textContent = '沒有符合篩選條件的法規紀錄。';
    return;
  }

  elements.status.textContent = `共 ${filtered} 筆紀錄`;
}

function setDocumentListVisibility(hasResults) {
  elements.documentList.hidden = !hasResults;
}

function createMetaItem(label, content) {
  const wrapper = document.createElement('div');
  wrapper.className = 'meta-item';

  const dt = document.createElement('dt');
  dt.textContent = label;

  const dd = document.createElement('dd');
  if (typeof content === 'string') {
    dd.textContent = content;
  } else if (content instanceof Node) {
    dd.appendChild(content);
  }

  wrapper.append(dt, dd);
  return wrapper;
}

function createAttachmentList(doc) {
  if (!doc.attachments?.length) {
    const empty = document.createElement('span');
    empty.className = 'attachment-empty';
    empty.textContent = '無附件';
    return empty;
  }

  const list = document.createElement('div');
  list.className = 'attachment-list';

  doc.attachments?.forEach((attachment, index) => {
    const link = document.createElement('a');
    link.className = 'attachment-link';
    link.href = attachment.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent =
      attachment.label?.trim() || `附件 ${String(index + 1).padStart(2, '0')}`;
    list.appendChild(link);
  });

  return list;
}

function createRelatedLinkList(doc) {
  if (!doc.relatedLinks?.length) {
    const empty = document.createElement('span');
    empty.className = 'attachment-empty';
    empty.textContent = '無連結';
    return empty;
  }

  const list = document.createElement('div');
  list.className = 'attachment-list';

  doc.relatedLinks.forEach((link, index) => {
    const anchor = document.createElement('a');
    anchor.className = 'attachment-link';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent =
      link.label?.trim() || `相關連結 ${String(index + 1).padStart(2, '0')}`;
    list.appendChild(anchor);
  });

  return list;
}

function createDocumentCard(doc) {
  const card = document.createElement('article');
  card.className = `document-card document-card--${doc.deadlineCategory}`;

  const header = document.createElement('header');
  header.className = 'document-card__header';

  const badge = document.createElement('span');
  badge.className = `badge badge--${doc.deadlineCategory}`;
  badge.textContent = BADGE_TEXT[doc.deadlineCategory] ?? '狀態不明';
  header.appendChild(badge);

  if (doc.date) {
    const issued = document.createElement('span');
    issued.className = 'document-card__issued';

    const issuedLabel = document.createElement('span');
    issuedLabel.className = 'document-card__label';
    issuedLabel.textContent = '發文日期';

    const issuedTime = document.createElement('time');
    issuedTime.dateTime = doc.date;
    issuedTime.textContent = doc.date;

    issued.append(issuedLabel, issuedTime);
    header.appendChild(issued);
  }

  const title = document.createElement('h2');
  title.className = 'document-card__title';
  const subjectText = doc.subject?.trim() || '未提供主旨';

  if (doc.subjectUrl) {
    const link = document.createElement('a');
    link.href = doc.subjectUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = subjectText;
    title.appendChild(link);
  } else {
    title.textContent = subjectText;
  }

  const metaList = document.createElement('dl');
  metaList.className = 'document-card__meta';

  const issuedContent = document.createElement('div');
  issuedContent.className = 'deadline-wrapper';

  if (doc.date) {
    const issuedTime = document.createElement('time');
    issuedTime.dateTime = doc.date;
    issuedTime.textContent = doc.date;

    const issuedNote = document.createElement('span');
    issuedNote.className = 'deadline-note';
    issuedNote.textContent = formatDeadlineNote(doc);

    issuedContent.append(issuedTime, issuedNote);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'deadline-note';
    fallback.textContent = '尚未提供日期';
    issuedContent.append(fallback);
  }

  metaList.append(
    createMetaItem('發文日期', issuedContent),
    createMetaItem('發文單位', doc.issuer ?? '未提供'),
    createMetaItem('條文編號', doc.articleNumber ?? doc.serial ?? '未提供'),
    createMetaItem('發文字號', doc.documentNumber ?? '未提供'),
    createMetaItem('分類', doc.category ?? '未提供'),
    createMetaItem('附件下載', createAttachmentList(doc)),
    createMetaItem('相關連結', createRelatedLinkList(doc)),
  );

  card.append(header, title, metaList);

  if (doc.content) {
    const content = document.createElement('p');
    content.className = 'document-card__content';
    content.textContent = doc.content;
    card.appendChild(content);
  }

  return card;
}

function renderDocuments(documents) {
  elements.documentList.replaceChildren(
    ...documents.map((doc) => createDocumentCard(doc)),
  );
}

function render() {
  state.filtered = applyFilters();
  updateStatus(state.filtered.length, state.documents.length);
  setDocumentListVisibility(state.filtered.length > 0);

  if (state.filtered.length) {
    renderDocuments(state.filtered);
  }
}

async function loadDocuments() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const documents = payload.documents ?? [];

    state.documents = documents.map(enrichDocument);
    render();

    if (payload.updatedAt) {
      elements.updatedAt.textContent = formatUpdatedAt(payload.updatedAt);
    }

    setDocumentListVisibility(state.filtered.length > 0);
  } catch (error) {
    console.error('Unable to load documents', error);
    elements.status.textContent = '資料載入失敗，請檢查網路或稍後再試。';
    elements.status.classList.add('status--error');
  }
}
