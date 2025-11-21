const DATA_URL = './data/documents.json';
const DEADLINE_SOON_DAYS = 7;
const RECENT_ISSUED_DAYS = 14;
const ACTIVE_ISSUED_DAYS = 90;
const BADGE_TEXT = {
  'due-soon': '最新',
  active: '',
  expired: '',
};

const PAGE_CHUNK = 21;
const DEFAULT_STATUS_VALUES = ['due-soon', 'active', 'expired'];
const REGION_FILTERS = {
  all: '全部',
  central: '中央',
  kaohsiung: '高雄',
  taipei: '臺北',
  newTaipei: '新北',
  other: '其他縣市',
};
const PRIORITY_ISSUERS = ['內政部國土管理署', '內政部'];

const state = {
  documents: [],
  filtered: [],
  filters: {
    search: '',
    sort: 'date-desc',
    statuses: new Set(DEFAULT_STATUS_VALUES),
    region: 'all',
    timeRange: '3m',
    simple: false,
  },
  totalRecords: null,
  pagination: {
    chunkSize: PAGE_CHUNK,
    visibleCount: PAGE_CHUNK,
  },
};

const serialCollator = new Intl.Collator('zh-Hant', {
  numeric: true,
  sensitivity: 'base',
});

function isPriorityIssuer(issuer) {
  if (!issuer) {
    return false;
  }

  return PRIORITY_ISSUERS.some((value) => issuer.includes(value));
}

const REGION_RULES = [
  {
    region: 'central',
    keywords: [
      '內政部',
      '國土管理署',
      '行政院',
      '經濟部',
      '中央',
      '中華民國全國建築師公會',
      '環境部',
    ],
  },
  { region: 'kaohsiung', keywords: ['高雄'] },
  { region: 'taipei', keywords: ['臺北', '台北'] },
  { region: 'newTaipei', keywords: ['新北'] },
];

const CITY_OR_COUNTY_KEYWORDS = [
  '臺北市',
  '台北市',
  '新北市',
  '高雄市',
  '臺中市',
  '台中市',
  '臺南市',
  '台南市',
  '基隆市',
  '桃園市',
  '新竹市',
  '嘉義市',
  '新竹縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '臺東縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣',
];

function hasCityOrCounty(text) {
  if (!text) {
    return false;
  }

  return CITY_OR_COUNTY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function detectRegion(issuer, subject) {
  const normalizedIssuer = issuer?.trim() ?? '';
  const normalizedSubject = subject?.trim() ?? '';

  if (
    normalizedSubject &&
    normalizedSubject.includes('法規研究委員會') &&
    normalizedSubject.includes('座談會工作報告')
  ) {
    return 'kaohsiung';
  }

  if (
    normalizedIssuer.includes('法規研究委員會') ||
    normalizedSubject.includes('法規研究委員會')
  ) {
    return 'kaohsiung';
  }

  if (
    normalizedIssuer.includes('科學園區管理局') ||
    normalizedSubject.includes('科學園區管理局')
  ) {
    return 'central';
  }

  const matchRegion = (text) => {
    if (!text) {
      return null;
    }

    for (const rule of REGION_RULES) {
      if (rule.keywords.some((keyword) => text.includes(keyword))) {
        return rule.region;
      }
    }
    return null;
  };

  const issuerRegion = matchRegion(normalizedIssuer);
  if (issuerRegion) {
    return issuerRegion;
  }

  if (!normalizedIssuer) {
    const subjectRegion = matchRegion(normalizedSubject);
    if (subjectRegion) {
      return subjectRegion;
    }
  }

  if (
    !hasCityOrCounty(normalizedIssuer) &&
    !hasCityOrCounty(normalizedSubject)
  ) {
    return 'central';
  }

  return 'other';
}

const elements = {
  status: document.getElementById('status'),
  documentList: document.getElementById('documentList'),
  searchInput: document.getElementById('search'),
  sortSelect: document.getElementById('sortSelect'),
  regionSelect: document.getElementById('regionFilter'),
  timeRange: document.getElementById('timeRange'),
  simpleToggle: document.getElementById('simpleView'),
  clearFilters: document.getElementById('clearFilters'),
  updatedAt: document.getElementById('updatedAt'),
  scrollSentinel: document.getElementById('scrollSentinel'),
};

const statusCheckboxes = Array.from(
  document.querySelectorAll('input[name="statusFilter"]'),
);

const loadMoreObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadMoreResults();
    }
  },
  { root: null, threshold: 0.2 },
);

if (elements.scrollSentinel) {
  loadMoreObserver.observe(elements.scrollSentinel);
}

function resetPagination() {
  state.pagination.visibleCount = state.pagination.chunkSize;
}

function getVisibleDocuments() {
  return state.filtered.slice(0, state.pagination.visibleCount);
}

function hasMoreResults() {
  return state.pagination.visibleCount < state.filtered.length;
}

function updateSentinelVisibility() {
  if (!elements.scrollSentinel) {
    return;
  }

  const shouldHide = state.filtered.length === 0 || !hasMoreResults();
  elements.scrollSentinel.hidden = shouldHide;
}

function loadMoreResults() {
  if (!state.filtered.length || !hasMoreResults()) {
    updateSentinelVisibility();
    return;
  }

  state.pagination.visibleCount = Math.min(
    state.filtered.length,
    state.pagination.visibleCount + state.pagination.chunkSize,
  );

  renderDocuments(getVisibleDocuments());
  updateSentinelVisibility();
}

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

if (elements.regionSelect) {
  elements.regionSelect.addEventListener('change', (event) => {
    state.filters.region = event.target.value;
    render();
  });
}

if (elements.timeRange) {
  elements.timeRange.addEventListener('change', (event) => {
    state.filters.timeRange = event.target.value;
    render();
  });
}

if (elements.simpleToggle) {
  elements.simpleToggle.addEventListener('click', () => {
    state.filters.simple = !state.filters.simple;
    elements.simpleToggle.classList.toggle('active', state.filters.simple);
    render();
  });
}

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
  state.filters.region = 'all';
  state.filters.timeRange = '3m';
  state.filters.simple = false;
  resetStatusFilters();

  elements.searchInput.value = '';
  elements.sortSelect.value = 'date-desc';
  if (elements.regionSelect) {
    elements.regionSelect.value = 'all';
  }
  if (elements.timeRange) {
    elements.timeRange.value = '3m';
  }
  if (elements.simpleToggle) {
    elements.simpleToggle.classList.remove('active');
  }

  render();
});

loadDocuments();

function bootstrapLayout() {
  // Use markup from docs/index.html; do not override DOM at runtime.
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
  const region = detectRegion(doc.issuer, doc.subject);

  let deadlineCategory = 'expired';
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
    region,
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
      state.filters.statuses.has(doc.deadlineCategory ?? 'expired'),
    );
  }

  if (state.filters.region !== 'all') {
    results = results.filter((doc) => doc.region === state.filters.region);
  }

  if (state.filters.timeRange && state.filters.timeRange !== 'all') {
    results = results.filter((doc) => {
      if (doc.daysSinceIssued == null) {
        return false;
      }

      switch (state.filters.timeRange) {
        case '3m':
          return doc.daysSinceIssued <= 90;
        case '1y':
          return doc.daysSinceIssued <= 365;
        case 'gt1y':
          return doc.daysSinceIssued > 365;
        default:
          return true;
      }
    });
  }

  return sortDocuments(results);
}

function updateStatus(filtered, total) {
  const filteredCount = filtered;
  const totalCount = state.totalRecords ?? total ?? filtered;

  elements.status.classList.remove('status--error');

  if (total === 0) {
    elements.status.textContent = '目前尚未取得法規紀錄，請稍候重試。';
    return;
  }

  if (filtered === 0) {
    elements.status.textContent = '沒有符合篩選條件的法規紀錄。';
    return;
  }

  elements.status.textContent = `共 ${filteredCount}/${totalCount} 筆紀錄`;
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
  const priorityIssuerLabel = isPriorityIssuer(doc.issuer)
    ? PRIORITY_ISSUERS.find((value) => doc.issuer?.includes(value))
    : null;

  const card = document.createElement('article');
  const classNames = ['document-card', `document-card--${doc.deadlineCategory}`];
  if (priorityIssuerLabel) {
    classNames.push('document-card--priority');
  }
  card.className = classNames.join(' ');

  const header = document.createElement('header');
  header.className = 'document-card__header';

  const badgeText = BADGE_TEXT[doc.deadlineCategory];
  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = `badge badge--${doc.deadlineCategory}`;
    badge.textContent = badgeText;
    header.appendChild(badge);
  }

  if (priorityIssuerLabel) {
    const priorityFlag = document.createElement('span');
    priorityFlag.className = 'document-card__flag';
    priorityFlag.textContent = priorityIssuerLabel;
    header.appendChild(priorityFlag);
  }

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

function createSimpleDocumentCard(doc) {
  const priorityIssuerLabel = isPriorityIssuer(doc.issuer)
    ? PRIORITY_ISSUERS.find((value) => doc.issuer?.includes(value))
    : null;

  const card = document.createElement('article');
  const classNames = ['document-card', 'document-card--simple'];
  if (priorityIssuerLabel) {
    classNames.push('document-card--priority');
  }
  card.className = classNames.join(' ');

  if (priorityIssuerLabel) {
    const priorityFlag = document.createElement('span');
    priorityFlag.className = 'document-card__flag';
    priorityFlag.textContent = priorityIssuerLabel;
    card.appendChild(priorityFlag);
  }

  const issued = document.createElement('div');
  issued.className = 'simple-row';
  const issuedLabel = document.createElement('span');
  issuedLabel.className = 'document-card__label';
  issuedLabel.textContent = '發文日期';
  const issuedDate = document.createElement('time');
  issuedDate.dateTime = doc.date ?? '';
  issuedDate.textContent = doc.date ?? '未提供';
  issued.append(issuedLabel, issuedDate);

  const title = document.createElement('h3');
  title.className = 'document-card__title';
  title.textContent = doc.subject?.trim() || '未提供主旨';

  const publish = document.createElement('div');
  publish.className = 'simple-row';
  const publishLabel = document.createElement('span');
  publishLabel.className = 'document-card__label';
  publishLabel.textContent = '發布';
  const publishNote = document.createElement('span');
  if (doc.daysSinceIssued != null) {
    publishNote.textContent = `${doc.daysSinceIssued} 天`;
  } else {
    publishNote.textContent = '—';
  }
  publish.append(publishLabel, publishNote);

  const issuer = document.createElement('div');
  issuer.className = 'simple-row';
  const issuerLabel = document.createElement('span');
  issuerLabel.className = 'document-card__label';
  issuerLabel.textContent = '發文單位';
  const issuerText = document.createElement('span');
  issuerText.textContent = doc.issuer ?? '未提供';
  issuer.append(issuerLabel, issuerText);

  card.append(issued, title, publish, issuer);
  return card;
}

function renderDocuments(documents) {
  elements.documentList.replaceChildren(
    ...documents.map((doc) =>
      state.filters.simple ? createSimpleDocumentCard(doc) : createDocumentCard(doc),
    ),
  );
}

function render({ preservePagination = false } = {}) {
  state.filtered = applyFilters();

  if (!preservePagination) {
    resetPagination();
  } else {
    state.pagination.visibleCount = Math.min(
      state.filtered.length,
      Math.max(state.pagination.visibleCount, state.pagination.chunkSize),
    );
  }

  updateStatus(state.filtered.length, state.documents.length);
  setDocumentListVisibility(state.filtered.length > 0);

  if (state.filtered.length) {
    renderDocuments(getVisibleDocuments());
  } else {
    elements.documentList.replaceChildren();
  }

  updateSentinelVisibility();
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
    state.totalRecords = payload.totalRecords ?? documents.length;
    render();

    if (payload.updatedAt) {
      elements.updatedAt.textContent = formatUpdatedAt(payload.updatedAt);
    }
    if (elements.regionSelect) {
      elements.regionSelect.value = state.filters.region;
    }
    if (elements.timeRange) {
      elements.timeRange.value = state.filters.timeRange;
    }

    setDocumentListVisibility(state.filtered.length > 0);
  } catch (error) {
    console.error('Unable to load documents', error);
    elements.status.textContent = '資料載入失敗，請檢查網路或稍後再試。';
    elements.status.classList.add('status--error');
  }
}
