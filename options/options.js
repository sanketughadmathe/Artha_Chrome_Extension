document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(['tooltipConfig'], (result) => {
    const config = result.tooltipConfig || {};
    document.getElementById('includeTags').value = 
      config.includeTags ? config.includeTags.join(',') : '';
  });

  document.getElementById('save').addEventListener('click', () => {
    const config = {
      showText: true,
      includeTags: document.getElementById('includeTags').value
        .toUpperCase()
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag)
    };

    chrome.storage.sync.set({ tooltipConfig: config }, () => {
      alert('Settings saved!');
    });
  });
});