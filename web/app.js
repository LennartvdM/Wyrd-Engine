const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const tabOrder = ['calendar', 'config', 'console', 'json', 'fixtures', 'logs'];

function setActiveTab(targetTab) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === targetTab;
    button.classList.toggle('active', isActive);
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === targetTab;
    panel.classList.toggle('active', isActive);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const targetTab = button.dataset.tab;
    setActiveTab(targetTab);
  });
});

function tabFromShortcutKey(key) {
  const numericKey = Number.parseInt(key, 10);
  if (Number.isNaN(numericKey)) {
    return null;
  }

  const index = numericKey - 1;
  if (index >= 0 && index < tabOrder.length) {
    return tabOrder[index];
  }
  return null;
}

const paletteOverlay = document.createElement('div');
paletteOverlay.className = 'command-palette-overlay';
paletteOverlay.setAttribute('aria-hidden', 'true');
paletteOverlay.hidden = true;

const paletteDialog = document.createElement('div');
paletteDialog.className = 'command-palette';
paletteDialog.setAttribute('role', 'dialog');
paletteDialog.setAttribute('aria-modal', 'true');

const paletteTitle = document.createElement('h2');
paletteTitle.className = 'command-palette-title';
paletteTitle.textContent = 'Command Palette';

const paletteList = document.createElement('ul');
paletteList.className = 'command-palette-actions';

const paletteActions = [
  { label: 'Go to Calendar', tab: 'calendar' },
  { label: 'Go to Config', tab: 'config' },
  { label: 'Go to Console', tab: 'console' },
  { label: 'Go to JSON', tab: 'json' },
  { label: 'Go to Fixtures', tab: 'fixtures' },
  { label: 'Go to Logs', tab: 'logs' },
  { label: 'Reload Runtime', disabled: true }
];

paletteActions.forEach((action) => {
  const item = document.createElement('li');
  item.className = 'command-palette-item';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'command-palette-action';
  button.textContent = action.label;

  if (action.disabled) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  } else if (action.tab) {
    button.addEventListener('click', () => {
      setActiveTab(action.tab);
      closePalette();
    });
  }

  item.append(button);
  paletteList.append(item);
});

paletteDialog.append(paletteTitle, paletteList);
paletteOverlay.append(paletteDialog);
document.body.append(paletteOverlay);

let isPaletteOpen = false;
let lastFocusedElement = null;

function openPalette() {
  if (isPaletteOpen) return;
  isPaletteOpen = true;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  paletteOverlay.hidden = false;
  paletteOverlay.classList.add('open');
  paletteOverlay.setAttribute('aria-hidden', 'false');

  const firstAction = paletteOverlay.querySelector('.command-palette-action:not([disabled])');
  if (firstAction) {
    firstAction.focus();
  }
}

function closePalette() {
  if (!isPaletteOpen) return;
  isPaletteOpen = false;
  paletteOverlay.classList.remove('open');
  paletteOverlay.setAttribute('aria-hidden', 'true');
  paletteOverlay.hidden = true;

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

paletteOverlay.addEventListener('click', (event) => {
  if (event.target === paletteOverlay) {
    closePalette();
  }
});

document.addEventListener('keydown', (event) => {
  const key = event.key;
  const hasModifier = event.ctrlKey || event.metaKey;

  if (hasModifier && !event.altKey && !event.shiftKey) {
    if (key.toLowerCase() === 'k') {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (isPaletteOpen) {
        closePalette();
      } else {
        openPalette();
      }
      return;
    }

    const targetTab = tabFromShortcutKey(key);
    if (targetTab) {
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      setActiveTab(targetTab);
      if (isPaletteOpen) {
        closePalette();
      }
      return;
    }
  }

  if (key === 'Escape' && isPaletteOpen) {
    event.preventDefault();
    closePalette();
  }
});

const configPanel = document.querySelector('.tab-panel[data-tab="config"]');
const consolePanel = document.querySelector('.tab-panel[data-tab="console"]');
const jsonPanel = document.querySelector('.tab-panel[data-tab="json"]');
const fixturesPanel = document.querySelector('.tab-panel[data-tab="fixtures"]');
const logsPanel = document.querySelector('.tab-panel[data-tab="logs"]');

if (configPanel) {
  const accordionSections = [
    {
      id: 'mk1-engine',
      title: 'MK1 Engine',
      content: 'Configuration options for the MK1 Engine will appear here.'
    },
    {
      id: 'mk2-engine',
      title: 'MK2 Engine',
      content: 'Configuration options for the MK2 Engine will appear here.'
    },
    {
      id: 'calendar-rig',
      title: 'Calendar Rig',
      content: 'Calendar Rig settings and adjustments will be available in this section.'
    },
    {
      id: 'workforce-rig',
      title: 'Workforce Rig',
      content: 'Manage Workforce Rig parameters from this placeholder area.'
    },
    {
      id: 'yearly-budget',
      title: 'Yearly Budget',
      content: 'Budget configuration tools will live in this Yearly Budget section.'
    }
  ];

  const storageKey = 'configAccordionState';
  let accordionState = {};

  try {
    const storedState = localStorage.getItem(storageKey);
    if (storedState) {
      const parsed = JSON.parse(storedState);
      if (parsed && typeof parsed === 'object') {
        accordionState = parsed;
      }
    }
  } catch (error) {
    console.warn('Unable to read config accordion state:', error);
  }

  const accordion = document.createElement('div');
  accordion.className = 'accordion';

  accordionSections.forEach((section) => {
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'accordion-header';
    header.dataset.sectionId = section.id;

    const title = document.createElement('span');
    title.className = 'accordion-title';
    title.textContent = section.title;

    const arrow = document.createElement('span');
    arrow.className = 'accordion-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▸';

    header.append(title, arrow);

    const content = document.createElement('div');
    content.className = 'accordion-content';
    content.innerHTML = `<p>${section.content}</p>`;

    const isOpen = Boolean(accordionState[section.id]);
    item.classList.toggle('open', isOpen);
    header.setAttribute('aria-expanded', String(isOpen));
    content.hidden = !isOpen;

    header.addEventListener('click', () => {
      const nowOpen = !item.classList.contains('open');
      item.classList.toggle('open', nowOpen);
      header.setAttribute('aria-expanded', String(nowOpen));
      content.hidden = !nowOpen;

      accordionState[section.id] = nowOpen;
      try {
        localStorage.setItem(storageKey, JSON.stringify(accordionState));
      } catch (error) {
        console.warn('Unable to persist config accordion state:', error);
      }
    });

    item.append(header, content);
    accordion.append(item);
  });

  configPanel.innerHTML = '';
  configPanel.append(accordion);
}

if (consolePanel) {
  const consoleContainer = document.createElement('div');
  consoleContainer.className = 'console-pane';

  const stdoutSection = document.createElement('section');
  stdoutSection.className = 'console-stream';

  const stdoutHeader = document.createElement('h3');
  stdoutHeader.className = 'console-stream-title';
  stdoutHeader.textContent = 'Stdout';

  const stdoutOutput = document.createElement('div');
  stdoutOutput.className = 'console-output';
  stdoutOutput.textContent = 'Program output will appear here.';

  stdoutSection.append(stdoutHeader, stdoutOutput);

  const stderrSection = document.createElement('section');
  stderrSection.className = 'console-stream';

  const stderrHeader = document.createElement('h3');
  stderrHeader.className = 'console-stream-title';
  stderrHeader.textContent = 'Stderr';

  const stderrOutput = document.createElement('div');
  stderrOutput.className = 'console-output';
  stderrOutput.textContent = 'Error output will appear here.';

  stderrSection.append(stderrHeader, stderrOutput);

  consoleContainer.append(stdoutSection, stderrSection);
  consolePanel.append(consoleContainer);
}

if (jsonPanel) {
  const jsonContainer = document.createElement('div');
  jsonContainer.className = 'json-pane';

  const jsonToolbar = document.createElement('div');
  jsonToolbar.className = 'json-toolbar';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'json-copy';
  copyButton.textContent = 'Copy';

  jsonToolbar.append(copyButton);

  const jsonOutput = document.createElement('pre');
  jsonOutput.className = 'json-output';
  jsonOutput.textContent = '{\n  "data": "JSON payloads will render here."\n}';

  jsonContainer.append(jsonToolbar, jsonOutput);
  jsonPanel.append(jsonContainer);
}

if (fixturesPanel) {
  const fixturesContainer = document.createElement('div');
  fixturesContainer.className = 'fixtures-pane';

  const fixturesList = document.createElement('ul');
  fixturesList.className = 'fixtures-list';

  const placeholderItem = document.createElement('li');
  placeholderItem.textContent = 'No fixtures loaded. Add fixtures to see them listed here.';

  fixturesList.append(placeholderItem);

  const fixturesActions = document.createElement('div');
  fixturesActions.className = 'fixtures-actions';

  const loadButton = document.createElement('button');
  loadButton.type = 'button';
  loadButton.textContent = 'Load';
  loadButton.disabled = true;

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  saveButton.disabled = true;

  fixturesActions.append(loadButton, saveButton);

  fixturesContainer.append(fixturesList, fixturesActions);
  fixturesPanel.append(fixturesContainer);
}

if (logsPanel) {
  const logsContainer = document.createElement('div');
  logsContainer.className = 'logs-pane';

  const logsToolbar = document.createElement('div');
  logsToolbar.className = 'logs-toolbar';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'logs-clear';
  clearButton.textContent = 'Clear';

  logsToolbar.append(clearButton);

  const logsOutput = document.createElement('div');
  logsOutput.className = 'logs-output';
  logsOutput.textContent = 'Log messages will appear here as they stream in.';

  logsContainer.append(logsToolbar, logsOutput);
  logsPanel.append(logsContainer);
}
