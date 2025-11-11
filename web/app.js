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
