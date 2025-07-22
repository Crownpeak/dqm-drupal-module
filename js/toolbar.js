(function ($, Drupal, once) {
  "use strict";

  Drupal.behaviors.dqmDrupalModuleToolbar = {
    attach: function (context, settings) {
      try {
        const $document = $(document);
        if (!$document.data('dqm-drupal-module-events-bound')) {
          $document.on('click', '.dqm-drupal-module-run-quality-check, .dqm-drupal-module-run-quality-check-secondary, .dqm-drupal-module-scan-url', function () {
            const method = $(this).hasClass('dqm-drupal-module-scan-url') ? 'url' : 'content';
            try {
              runQualityCheck(this, method);
            } catch (e) {
              const errorPrefix = method === 'url' ? 'Error running URL scan: ' : 'Error running quality check: ';
              alert(errorPrefix + e.message);
            }
          });
          $document.data('dqm-drupal-module-events-bound', true);
        }
      } catch (e) {
        alert('Error initializing DQM toolbar: ' + e.message);
      }
    }
  };

  function runQualityCheck(buttonElement, method) {
    try {
      const $button = $(buttonElement);
      if ($button.data('submitting')) {
        return;
      }
      prepareButtonState($button);
      if (method === 'url') {
        runUrlBasedScan(buttonElement);
      } else {
        runContentBasedScan(buttonElement);
      }
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running quality check: ' + e.message);
    }
  }
  
  function performPageScan(requestData, url, buttonElement, assetKey) {
    $.ajax({
      url: url,
      method: 'POST',
      data: requestData,
      dataType: 'json',
      beforeSend: function(xhr, settings) {},
      success: function (data) {
        try {
          handleScanResponse(data, buttonElement, assetKey);
        } catch (e) {
          resetButtonState(buttonElement);
          alert('Error handling scan response: ' + e.message);
        }
      },
      error: function (xhr, status, error) {
        try {
          handleScanError(xhr, status, error, buttonElement);
        } catch (e) {
          resetButtonState(buttonElement);
          alert('Error handling scan error: ' + e.message);
        }
      }
    });
  }

  function runUrlBasedScan(buttonElement) {
    try {
      const currentUrl = window.location.href;
      const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
      const existingAssetId = localStorage.getItem(assetKey);
      const requestData = {
        url: currentUrl,
        cleanContent: true
      };
      if (existingAssetId) {
        requestData.assetId = existingAssetId;
      }
      performPageScan(requestData, Drupal.url('dqm-drupal-module/scan-from-url'), buttonElement, assetKey);
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running URL-based scan: ' + e.message);
    }
  }

  function runContentBasedScan(buttonElement) {
    try {
      const isPreviewPage = window.location.href.includes('/node/preview/') || window.location.href.includes('/preview/');
      let content = isPreviewPage ? extractPreviewContent() : extractRegularPageContent();
      let extractionMethod = isPreviewPage ? 'preview_content_extraction' : 'regular_page_extraction';

      if (!content) {
        resetButtonState(buttonElement);
        return;
      }
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const pageUrl = window.location.href;
      const assetKey = 'dqm_asset_id_' + btoa(pageUrl);
      const existingAssetId = localStorage.getItem(assetKey);
      const requestData = { content: content };
      if (existingAssetId) {
        requestData.assetId = existingAssetId;
      }
      performPageScan(requestData, Drupal.url('dqm-drupal-module/scan'), buttonElement, assetKey);
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running content-based scan: ' + e.message);
    }
  }

  function handleScanResponse(data, buttonElement, assetKey) {
    if (data.success) {
      localStorage.setItem(assetKey, data.assetId);
      fetchQualityResults(data.assetId, buttonElement);
    } else {
      resetButtonState(buttonElement);
      alert('Scan failed: ' + (data.message || 'Unknown error'));
    }
  }

  function handleScanError(xhr, status, error, buttonElement) {
    resetButtonState(buttonElement);
    alert('AJAX error: ' + error);
  }

  function setButtonText($button, text) {
    if ($button.is('input')) {
      $button.val(text);
    } else {
      $button.text(text);
    }
  }

  function prepareButtonState($button) {
    $button.data('submitting', true);
    $button.addClass('loading');
    $button.prop('disabled', true);
    const originalText = $button.val() || $button.text();
    $button.data('original-text', originalText);
    setButtonText($button, 'Running Quality Check...');
  }

  function resetButtonState(buttonElement) {
    const $button = $(buttonElement);
    $button.data('submitting', false);
    $button.removeClass('loading');
    $button.prop('disabled', false);

    const originalText = $button.data('original-text');
    if (originalText) {
      setButtonText($button, originalText);
    }
  }

  function fetchQualityResults(assetId, buttonElement) {
    let resultsContainer = document.getElementById('dqm-results-container');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.id = 'dqm-results-container';
      resultsContainer.className = 'dqm-results-container';
      buttonElement.parentNode.insertBefore(resultsContainer, buttonElement.nextSibling);
    }

    resultsContainer.innerHTML = '<div class="dqm-loading"><span class="dqm-spinner"></span></div>';

    $.ajax({
      url: Drupal.url('dqm-drupal-module/results/' + assetId),
      method: 'GET',
      dataType: 'json',
      success: function (response) {
        resetButtonState(buttonElement);
        if (response.success && response.data) {
          displayQualityResults(response.data, resultsContainer);
        } else {
          resultsContainer.innerHTML = '<div class="dqm-card"><p>Failed to load quality results: ' + (response.message || 'Unknown error') + '</p></div>';
        }
      },
      error: function (xhr, status, error) {
        resetButtonState(buttonElement);
        resultsContainer.innerHTML = '<div class="dqm-card"><p>Error loading quality results: ' + error + '</p></div>';
      }
    });
  }

  function normaliseCheckpoints(checkpoints) {
    return checkpoints.map(cp => ({
      ...cp,
      topics: (cp?.topics ?? []).sort()
    }));
  }

  export function displayQualityResults(data, container) {
    if (!data || !data.checkpoints || !Array.isArray(data.checkpoints)) {
      container.innerHTML = '<div class="dqm-card"><p>No quality results available.</p></div>';
      return;
    }

    const topicColors = {
      'Accessibility': '#006675',
      'SEO': '#2fe8b6',
      'Brand': '#3636c5',
      'Regulatory': '#b604d4',
      'Legal': '#001746',
      'Usability': '#cdd1d0'
    };

    const checkpoints = normaliseCheckpoints(data.checkpoints);
    let passedCount = 0;
    const totalCount = checkpoints.length;
    const failedCheckpoints = [];
    const topicCounts = {};

    for (const checkpoint of checkpoints) {
      if (checkpoint.failed === true) {
        failedCheckpoints.push(checkpoint);
      } else {
        passedCount++;
      }

      for (const topic of checkpoint.topics) {
        if (!topicCounts[topic]) {
          topicCounts[topic] = {
            total: 0,
            passed: 0,
            failed: 0,
            color: topicColors[topic] || '#888',
            className: topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          };
        }

        topicCounts[topic].total++;
        if (checkpoint.failed === true) {
          topicCounts[topic].failed++;
        } else {
          topicCounts[topic].passed++;
        }
      }
    }

    for (const [key, value] of Object.entries(topicCounts)) {
      topicCounts[key].percent = value.total > 0 ? Math.round((value.passed / value.total) * 100) : 0;
    }
    const sortedTopics = Object.keys(topicCounts).sort();

    const percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    let html =
        `<div class="dqm-card">
      <h3>📊 Quality Overview</h3>
      <div class="dqm-chart-container">
        <div class="dqm-pie-chart" data-percent="${percent}">
          <div class="percent-label">${percent}%</div>
        </div>
        <div class="dqm-legend">
          <div class="dqm-legend-item">
            <div class="dqm-legend-color passed"></div>
            <span>Passed (${passedCount})</span>
          </div>
          <div class="dqm-legend-item">
            <div class="dqm-legend-color failed"></div>
            <span>Failed (${totalCount - passedCount})</span>
          </div>
        </div>
      </div>
    </div>`;


    let topicsHtml = '';
    for (const name of sortedTopics) {
      const topic = topicCounts[name];
      if (topicsHtml.length > 0) {
        topicsHtml += '<hr class="dqm-divider">';
      }

      topicsHtml += `<div class="dqm-topic-breakdown">
            <div class="dqm-topic-header">
                <span class="dqm-topic-badge" style="background:${topic.color}">${name}</span>
                <span>${topic.passed}/${topic.total} passed</span>
            </div>
            <div class="dqm-progress-bar">
                <div class="dqm-progress-fill" style="width:${topic.percent}%;background:${topic.color}"></div>
            </div>
        </div>`;
    }

    html += `<div class="dqm-card">
        <h3>📈 Quality Breakdown</h3>
        ${topicsHtml}
    </div>`;

    if (failedCheckpoints.length > 0) {
      let topicsFilterHtml = '';
      let topicOptionsHtml = '';

      for (const topic of sortedTopics) {
        const topicInfo = topicCounts[topic];
        if (topicInfo.failed > 0) {
          const count = topicInfo.total - topicInfo.passed;
          topicOptionsHtml += `<option value="${topicInfo.className}">${topic} (${count})</option>`;
        }
      }

      if (topicOptionsHtml.length > 0) {
        topicsFilterHtml = `<div class="dqm-filter-container">
                <select class="dqm-topics-filter" id="dqm-topics-filter">
                    <option value="all">All Topics (${failedCheckpoints.length})</option>
                    ${topicOptionsHtml}
                </select>
            </div>`;
      }

      let failedCheckpointsHtml = '';
      for (const checkpoint of failedCheckpoints) {
        let checkpointBadgesHtml = '';
        if (checkpoint.topics.length > 0) {

          const badgesHtml = checkpoint.topics.map(topic => {
            const badgeClassName = topicCounts[topic] ? topicCounts[topic].className : '';
            return `<span class="badge ${badgeClassName}">${topic}</span>`;
          }).join('');

          checkpointBadgesHtml = `<div class="checkpoint-badges" style="display:flex;margin-top:4px;">${badgesHtml}</div>`;
        }

        const topicClasses = checkpoint.topics.map((topic) => 'topic-' + topicCounts[topic].className).join(' ');
        failedCheckpointsHtml += `<div class="dqm-checkpoint-item ${topicClasses}" data-topics="${checkpoint.topics.join(',')}">
              <div class="checkpoint-icon-title-row">
                <div class="checkpoint-icon failed dqm-info-icon" data-id="${checkpoint.id}" style="cursor:pointer;">!</div>
                <div>
                  <span class="checkpoint-title">${checkpoint.name || 'Unknown Checkpoint'}</span>
                    ${checkpointBadgesHtml}
                 </div>
              </div>
            </div>`;
      }

      html += `<div class="dqm-card">
            <h3>❌ Failed Checkpoints (${failedCheckpoints.length})</h3>
            ${topicsFilterHtml}
            <div class="dqm-checkpoints-list" id="dqm-checkpoints-list">
                ${failedCheckpointsHtml}
            </div>
        </div>`;

    }
    html += '<button class="dqm-drupal-module-run-quality-check-secondary button">Run Quality Check</button>';

    container.innerHTML = html;

    const pieChart = container.querySelector('.dqm-pie-chart');
    if (pieChart) {
      const percentage = parseInt(pieChart.getAttribute('data-percent') || '0');
      const passedDegrees = Math.round((percentage / 100) * 360);
      const failedDegrees = 360 - passedDegrees;

      const background = (passedDegrees > 0) ? `conic-gradient(#b604d4 0deg ${passedDegrees}deg, #303747 ${passedDegrees}deg 360deg)` : `#303747`;
      pieChart.style.background = background;
    }

    let modal = document.getElementById('dqm-checkpoint-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dqm-checkpoint-modal';
      modal.className = 'dqm-modal';
      Object.assign(modal.style, {
        display: 'none',
        position: 'fixed',
        zIndex: '9999',
        background: '#fff',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        borderRadius: '8px',
        padding: '1.5em 2em 1.5em 1.5em',
        minWidth: '340px',
        maxWidth: '420px',
        maxHeight: '70vh',
        overflowY: 'auto',
        transition: 'opacity 0.2s',
        opacity: '1'
      });
      document.body.appendChild(modal);
    }

    function showModal(cp) {
      modal.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'dqm-modal-title';
      title.textContent = cp.name || '';
      modal.appendChild(title);
      if (cp.description) {
        const desc = document.createElement('div');
        desc.className = 'dqm-modal-desc';
        desc.textContent = cp.description;
        modal.appendChild(desc);
      }
      if (Array.isArray(cp.topics) && cp.topics.length > 0) {
        const topicsDiv = document.createElement('div');
        topicsDiv.className = 'dqm-modal-topics';
        topicsDiv.innerHTML = cp.topics.map(function(topic) {
          const badgeClass = (topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return '<span class="badge ' + badgeClass + '">' + topic + '</span>';
        }).join(' ');
        modal.appendChild(topicsDiv);
      }
      Object.assign(modal.style, {
        display: 'block',
        opacity: '1',
        top: '32px',
        left: '32px',
        right: ''
      });
    }
    const infoIcons = container.querySelectorAll('.dqm-info-icon');
    infoIcons.forEach(function(icon) {
      icon.addEventListener('mouseenter', function(e) {
        const id = icon.getAttribute('data-id');
        const cp = failedCheckpoints.find(cp => cp.id === id);
        showModal(cp);
      });
      icon.addEventListener('mouseleave', function(e) {
        setTimeout(function() {
          modal.style.display = 'none';
        }, 200);
      });
    });
    modal.addEventListener('mouseenter', function() {
      modal.style.display = 'block';
    });
    modal.addEventListener('mouseleave', function() {
      modal.style.display = 'none';
    });

    const filterSelect = container.querySelector('#dqm-topics-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function(e) {
        const selectedTopic = e.target.value;
        const checkpointItems = container.querySelectorAll('.dqm-checkpoint-item');
        let visibleCount = 0;

        checkpointItems.forEach(function(item) {
          if (selectedTopic === 'all') {
            item.style.display = 'flex';
            visibleCount++;
          } else {
            const itemTopics = item.getAttribute('data-topics') || '';
            const topicArray = itemTopics.split(',').map(function(topic) {
              return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            });

            if (topicArray.indexOf(selectedTopic) !== -1) {
              item.style.display = 'flex';
              visibleCount++;
            } else {
              item.style.display = 'none';
            }
          }
        });

        const cardTitle = container.querySelector('.dqm-card h3');
        if (cardTitle && selectedTopic !== 'all') {
          const selectedTopicName = e.target.options[e.target.selectedIndex].text.split(' (')[0];
          cardTitle.textContent = '❌ Failed Checkpoints - ' + selectedTopicName + ' (' + visibleCount + ')';
        } else if (cardTitle) {
          cardTitle.textContent = '❌ Failed Checkpoints (' + failedCheckpoints.length + ')';
        }
      });
    }
  }

  function extractPreviewContent() {
    const contentSelectors = [
      '.node-preview',
      '.node--view-mode-full',
      '.node',
      'main .content',
      'main',
      '.main-content',
      '.page-content',
      '#main-content',
      '[role="main"]'
    ];

    let contentElement = null;

    for (let i = 0; i < contentSelectors.length; i++) {
      contentElement = document.querySelector(contentSelectors[i]);
      if (contentElement) {
        break;
      }
    }

    if (!contentElement) {
      return extractCleanBodyContent();
    }
    const contentClone = contentElement.cloneNode(true);
    removeAdminElements(contentClone);
    return createCleanHtmlStructure(contentClone.outerHTML);
  }

  function extractRegularPageContent() {
    const html = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!html) {
      return extractCleanBodyContent();
    }

    const htmlClone = html.cloneNode(true);
    removeAdminElements(htmlClone);
    return createCleanHtmlStructure(htmlClone.innerHTML);
  }

  function extractCleanBodyContent() {
    const bodyClone = document.body.cloneNode(true);

    removeAdminElements(bodyClone);
    return createCleanHtmlStructure(bodyClone.innerHTML);
  }

  function removeAdminElements(element) {
    const adminSelectors = [
      '.toolbar',
      '.toolbar-bar',
      '.toolbar-tray',
      '#toolbar-administration',
      '.admin-toolbar',
      '.contextual-links-wrapper',
      '.contextual',
      '.local-tasks',
      '.local-actions',
      '.messages',
      '.breadcrumb',
      '[data-drupal-messages]',
      '.system-breadcrumb',
      '.tabs',
      '.tabs--primary',
      '.tabs--secondary',
      '.action-links',
      '.admin-menu',
      '.shortcuts',
      '#edit-actions',
      '.form-actions',
      '.dqm-drupal-module-toolbar-item',
      '.dqm-results-container',
      '[id*="edit-"]',
      '[class*="edit-"]',
      'script',
      'noscript',
      '.visually-hidden',
      '.sr-only',
      '.hidden',
      '[style*="display: none"]',
      '[style*="display:none"]'
    ];

    let removedCount = 0;

    adminSelectors.forEach(function(selector) {
      const elements = element.querySelectorAll(selector);
      elements.forEach(function(el) {
        el.remove();
        removedCount++;
      });
    });

    const allElements = element.querySelectorAll('*');
    allElements.forEach(function(el) {
      if (el.className && typeof el.className === 'string') {
        if (el.className.includes('admin') ||
            el.className.includes('toolbar') ||
            el.className.includes('contextual') ||
            el.className.includes('edit-') ||
            el.className.includes('form-') ||
            el.className.includes('drupal-')) {
          if (!el.className.includes('content') &&
              !el.className.includes('node') &&
              !el.className.includes('field') &&
              !el.className.includes('text')) {
            el.remove();
            removedCount++;
          }
        }
      }

      if (el.hasAttribute('data-drupal-selector') ||
          el.hasAttribute('data-quickedit-entity-id') ||
          el.hasAttribute('data-contextual-id')) {
        el.removeAttribute('data-drupal-selector');
        el.removeAttribute('data-quickedit-entity-id');
        el.removeAttribute('data-contextual-id');
      }
    });

    return element;
  }

  function createCleanHtmlStructure(bodyContent) {
    const pageTitle = document.title || 'Page Content';

    const descMeta = document.querySelector('meta[name="description"]');
    const metaDescription = descMeta ? '<meta name="description" content="' + descMeta.getAttribute('content') + '">' : '';

    const lang = document.documentElement.lang || 'en';

    return `<!DOCTYPE html>
    <html lang="${lang}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${metaDescription}
            <title>${pageTitle}</title>
        </head>
        <body>${bodyContent}</body>
    </html>`;
  }
})(jQuery, Drupal, window.once);
