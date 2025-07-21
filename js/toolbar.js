(function ($, Drupal, once) {
  "use strict";

  Drupal.behaviors.dqmDrupalModuleToolbar = {
    attach: function (context, settings) {
      try {
        const $document = $(document);
        if (!$document.data('dqm-drupal-module-events-bound')) {
          $document.on('click', '.dqm-drupal-module-run-quality-check', function() {
            try {
              runQualityCheck(this, 'content');
            } catch (e) {
              alert('Error running quality check: ' + e.message);
            }
          });
          $document.on('click', '.dqm-drupal-module-run-quality-check-secondary', function() {
            try {
              runQualityCheck(this, 'content');
            } catch (e) {
              alert('Error running quality check: ' + e.message);
            }
          });
          $document.on('click', '.dqm-drupal-module-scan-url', function() {
            try {
              runQualityCheck(this, 'url');
            } catch (e) {
              alert('Error running URL scan: ' + e.message);
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
      $button.data('submitting', true);
      $button.addClass('loading');
      $button.prop('disabled', true);
      const originalText = $button.val() || $button.text();
      $button.data('original-text', originalText);
      const loadingText = 'Running Quality Check...';
      if ($button.is('input')) {
        $button.val(loadingText);
      } else {
        $button.text(loadingText);
      }
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
      $.ajax({
        url: Drupal.url('dqm-drupal-module/scan-from-url'),
        method: 'POST',
        data: requestData,
        dataType: 'json',
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
    } catch (e) {
      resetButtonState(buttonElement);
      alert('Error running URL-based scan: ' + e.message);
    }
  }

  function runContentBasedScan(buttonElement) {
    try {
      let content = '';
      let extractionMethod = '';
      const isPreviewPage = window.location.href.includes('/node/preview/') || window.location.href.includes('/preview/');
      if (isPreviewPage) {
        extractionMethod = 'preview_content_extraction';
        content = extractPreviewContent();
      } else {
        extractionMethod = 'regular_page_extraction';
        content = extractRegularPageContent();
      }
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
      $.ajax({
        url: Drupal.url('dqm-drupal-module/scan'),
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

  function resetButtonState(buttonElement) {
    const $button = $(buttonElement);
    $button.data('submitting', false);
    $button.removeClass('loading');
    $button.prop('disabled', false);

    const originalText = $button.data('original-text');
    if (originalText) {
      if ($button.is('input')) {
        $button.val(originalText);
      } else {
        $button.text(originalText);
      }
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

  function displayQualityResults(data, container) {
    if (!data || !data.checkpoints || !Array.isArray(data.checkpoints)) {
      container.innerHTML = '<div class="dqm-card"><p>No quality results available.</p></div>';
      return;
    }

    const checkpoints = data.checkpoints;
    let passedCount = 0;
    const totalCount = checkpoints.length;
    const failedCheckpoints = [];
    const topicCounts = {};

    checkpoints.forEach(function (checkpoint) {
      if (checkpoint.failed === true) {
        failedCheckpoints.push(checkpoint);
      } else {
        passedCount++;
      }

      if (checkpoint.topics && Array.isArray(checkpoint.topics)) {
        checkpoint.topics.forEach(function (topic) {
          if (!topicCounts[topic]) {
            topicCounts[topic] = { total: 0, passed: 0 };
          }
          topicCounts[topic].total++;
          if (checkpoint.failed !== true) {
            topicCounts[topic].passed++;
          }
        });
      }
    });

    const percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    let html = '';

    html += '<div class="dqm-card">';
    html += '<h3>📊 Quality Overview</h3>';
    html += '<div class="dqm-chart-container">';
    html += '<div class="dqm-pie-chart" data-percent="' + percent + '">';
    html += '<div class="percent-label">' + percent + '%</div>';
    html += '</div>';
    html += '<div class="dqm-legend">';
    html += '<div class="dqm-legend-item">';
    html += '<div class="dqm-legend-color passed"></div>';
    html += '<span>Passed (' + passedCount + ')</span>';
    html += '</div>';
    html += '<div class="dqm-legend-item">';
    html += '<div class="dqm-legend-color failed"></div>';
    html += '<span>Failed (' + (totalCount - passedCount) + ')</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    if (Object.keys(topicCounts).length > 0) {
      html += '<div class="dqm-card">';
      html += '<h3>📈 Quality Breakdown</h3>';

      const topicColors = {
        'Accessibility': '#006675',
        'SEO': '#2fe8b6',
        'Brand': '#3636c5',
        'Regulatory': '#b604d4',
        'Legal': '#001746',
        'Usability': '#cdd1d0'
      };

      Object.keys(topicCounts).forEach(function (topic, index) {
        const counts = topicCounts[topic];
        const topicPercent = counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0;
        const color = topicColors[topic] || '#888';

        if (index > 0) {
          html += '<hr class="dqm-divider">';
        }

        html += '<div class="dqm-topic-breakdown">';
        html += '<div class="dqm-topic-header">';
        html += '<span class="dqm-topic-badge" style="background:' + color + '">' + topic + '</span>';
        html += '<span>' + counts.passed + '/' + counts.total + ' passed</span>';
        html += '</div>';
        html += '<div class="dqm-progress-bar">';
        html += '<div class="dqm-progress-fill" style="width:' + topicPercent + '%;background:' + color + '"></div>';
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
    }

    if (failedCheckpoints.length > 0) {
      const uniqueTopics = [];
      failedCheckpoints.forEach(function (checkpoint) {
        if (Array.isArray(checkpoint.topics)) {
          checkpoint.topics.forEach(function(topic) {
            if (uniqueTopics.indexOf(topic) === -1) {
              uniqueTopics.push(topic);
            }
          });
        }
      });

      html += '<div class="dqm-card">';
      html += '<h3>❌ Failed Checkpoints (' + failedCheckpoints.length + ')</h3>';

      if (uniqueTopics.length > 1) {
        html += '<div class="dqm-filter-container">';
        html += '<select class="dqm-topics-filter" id="dqm-topics-filter">';
        html += '<option value="all">All Topics (' + failedCheckpoints.length + ')</option>';
        uniqueTopics.sort().forEach(function(topic) {
          let count = 0;
          failedCheckpoints.forEach(function(checkpoint) {
            if (Array.isArray(checkpoint.topics) && checkpoint.topics.indexOf(topic) !== -1) {
              count++;
            }
          });
          html += '<option value="' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '">' + topic + ' (' + count + ')</option>';
        });
        html += '</select>';
        html += '</div>';
      }

      html += '<div class="dqm-checkpoints-list" id="dqm-checkpoints-list">';
      failedCheckpoints.forEach(function (checkpoint, idx) {
        let topicClasses = '';
        if (Array.isArray(checkpoint.topics)) {
          topicClasses = checkpoint.topics.map(function(topic) {
            return 'topic-' + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          }).join(' ');
        }

        html += '<div class="dqm-checkpoint-item ' + topicClasses + '" data-topics="' + (Array.isArray(checkpoint.topics) ? checkpoint.topics.join(',') : '') + '">';
        html += '<div class="checkpoint-icon-title-row">';
        html += '<div class="checkpoint-icon failed dqm-info-icon" data-idx="' + idx + '" style="cursor:pointer;">!</div>';
        html += '<div>';
        html += '<span class="checkpoint-title">' + (checkpoint.name || 'Unknown Checkpoint') + '</span>';
        if (Array.isArray(checkpoint.topics) && checkpoint.topics.length > 0) {
          html += '<div class="checkpoint-badges" style="display:flex;margin-top:4px;">';
          const sortedTopics = checkpoint.topics.slice().sort();
          sortedTopics.forEach(function(topic) {
            const badgeClass = (topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            html += '<span class="badge ' + badgeClass + '">' + topic + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }
    html += '<button class="dqm-drupal-module-run-quality-check-secondary button">Run Quality Check</button>';

    container.innerHTML = html;
    const pieChart = container.querySelector('.dqm-pie-chart');
    if (pieChart) {
      const percentage = parseInt(pieChart.getAttribute('data-percent') || '0');
      const passedDegrees = Math.round((percentage / 100) * 360);
      const failedDegrees = 360 - passedDegrees;

      if (passedDegrees > 0) {
        pieChart.style.background = 'conic-gradient(#b604d4 0deg ' + passedDegrees + 'deg, #303747 ' + passedDegrees + 'deg 360deg)';
      } else {
        pieChart.style.background = '#303747';
      }
    }

    let modal = document.getElementById('dqm-checkpoint-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dqm-checkpoint-modal';
      modal.className = 'dqm-modal';
      modal.style.display = 'none';
      modal.style.position = 'fixed';
      modal.style.zIndex = '9999';
      modal.style.background = '#fff';
      modal.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
      modal.style.borderRadius = '8px';
      modal.style.padding = '1.5em 2em 1.5em 1.5em';
      modal.style.minWidth = '340px';
      modal.style.maxWidth = '420px';
      modal.style.maxHeight = '70vh';
      modal.style.overflowY = 'auto';
      modal.style.transition = 'opacity 0.2s';
      modal.style.opacity = '1';
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
      modal.style.display = 'block';
      modal.style.opacity = '1';
      modal.style.top = '32px';
      modal.style.left = '32px';
      modal.style.right = '';
    }
    const infoIcons = container.querySelectorAll('.dqm-info-icon');
    infoIcons.forEach(function(icon) {
      icon.addEventListener('mouseenter', function(e) {
        const idx = parseInt(icon.getAttribute('data-idx'), 10);
        const cp = failedCheckpoints[idx];
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

    const cleanHtml = createCleanHtmlStructure(contentClone.outerHTML);

    return cleanHtml;
  }

  function extractRegularPageContent() {
    const html = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!html) {
      return extractCleanBodyContent();
    }

    const htmlClone = html.cloneNode(true);

    removeAdminElements(htmlClone);

    const cleanHtml = createCleanHtmlStructure(htmlClone.innerHTML);

    return cleanHtml;
  }

  function extractCleanBodyContent() {
    const bodyClone = document.body.cloneNode(true);
    removeAdminElements(bodyClone);

    const cleanHtml = createCleanHtmlStructure(bodyClone.innerHTML);
    return cleanHtml;
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

    let metaDescription = '';
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      metaDescription = '<meta name="description" content="' + descMeta.getAttribute('content') + '">';
    }

    const lang = document.documentElement.lang || 'en';

    const cleanHtml = '<!DOCTYPE html>\n' +
        '<html lang="' + lang + '">\n' +
        '<head>\n' +
        '  <meta charset="UTF-8">\n' +
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '  <title>' + pageTitle + '</title>\n' +
        metaDescription + '\n' +
        '</head>\n' +
        '<body>\n' +
        bodyContent + '\n' +
        '</body>\n' +
        '</html>';

    return cleanHtml;
  }
})(jQuery, Drupal, window.once);
