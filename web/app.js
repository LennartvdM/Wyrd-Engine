const tabButtons = Array.from(document.querySelectorAll('.tab'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));

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

const configPanel = document.querySelector('.tab-panel[data-tab="config"]');

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
