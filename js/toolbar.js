(function ($, Drupal, once) {
  Drupal.behaviors.crownpeakDqmToolbar = {
    attach: function (context, settings) {
      once('crownpeak-dqm', '.crownpeak-dqm-run-quality-check', context).forEach(function (el) {
        $(el).on('click', function () {
          runQualityCheck(this, 'content');
        });
      });
      
      once('crownpeak-dqm-url', '.crownpeak-dqm-scan-url', context).forEach(function (el) {
        $(el).on('click', function () {
          runQualityCheck(this, 'url');
        });
      });
    }
  };

  function runQualityCheck(buttonElement, method) {
    if ($(buttonElement).data('submitting')) {
      return;
    }
    $(buttonElement).data('submitting', true);
    
    if (method === 'url') {
      runUrlBasedScan(buttonElement);
    } else {
      runContentBasedScan(buttonElement);
    }
  }

  function runUrlBasedScan(buttonElement) {
    var currentUrl = window.location.href;
    
    var assetKey = 'dqm_asset_id_' + btoa(currentUrl);
    var existingAssetId = localStorage.getItem(assetKey);
    var requestData = { 
      url: currentUrl,
      cleanContent: true
    };
    if (existingAssetId) {
      requestData.assetId = existingAssetId;
    }
    
    $.ajax({
      url: Drupal.url('crownpeak-dqm/scan-from-url'),
      method: 'POST',
      data: requestData,
      dataType: 'json',
      success: function (data) {
        handleScanResponse(data, buttonElement, assetKey);
      },
      error: function (xhr, status, error) {
        handleScanError(xhr, status, error, buttonElement);
      }
    });
  }

  function runContentBasedScan(buttonElement) {
    var content = '';
    var extractionMethod = '';
    var isPreviewPage = window.location.href.includes('/node/preview/') || window.location.href.includes('/preview/');
    
    if (isPreviewPage) {
      extractionMethod = 'preview_content_extraction';
      content = extractPreviewContent();
    } else {
      extractionMethod = 'regular_page_extraction';
      content = extractRegularPageContent();
    }
    if (!content) {
      $(buttonElement).data('submitting', false);
      return;
    }
    
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    
    var pageUrl = window.location.href;
    var assetKey = 'dqm_asset_id_' + btoa(pageUrl);
    var existingAssetId = localStorage.getItem(assetKey);
    var requestData = { content: content };
    if (existingAssetId) {
      requestData.assetId = existingAssetId;
    }
    
    $.ajax({
      url: Drupal.url('crownpeak-dqm/scan'),
      method: 'POST',
      data: requestData,
      dataType: 'json',
      beforeSend: function(xhr, settings) {
      },
      success: function (data) {
        handleScanResponse(data, buttonElement, assetKey);
      },
      error: function (xhr, status, error) {
        handleScanError(xhr, status, error, buttonElement);
      }
    });
  }

  function handleScanResponse(data, buttonElement, assetKey) {
    $(buttonElement).data('submitting', false);
    if (data.success) {
      localStorage.setItem(assetKey, data.assetId);
      fetchQualityResults(data.assetId, buttonElement);
    } else {
      alert('Scan failed: ' + (data.message || 'Unknown error'));
    }
  }

  function handleScanError(xhr, status, error, buttonElement) {
    $(buttonElement).data('submitting', false);
    alert('AJAX error: ' + error);
  }
  
  function fetchQualityResults(assetId, buttonElement) {
    var resultsContainer = document.getElementById('dqm-results-container');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.id = 'dqm-results-container';
      resultsContainer.className = 'dqm-results-container';
      buttonElement.parentNode.insertBefore(resultsContainer, buttonElement.nextSibling);
    }
    
    resultsContainer.innerHTML = '<div class="dqm-loading"><span class="dqm-spinner"></span></div>';
    
    $.ajax({
      url: Drupal.url('crownpeak-dqm/results/' + assetId),
      method: 'GET',
      dataType: 'json',
      success: function (response) {
        if (response.success && response.data) {
          displayQualityResults(response.data, resultsContainer);
        } else {
          resultsContainer.innerHTML = '<div class="dqm-card"><p>Failed to load quality results: ' + (response.message || 'Unknown error') + '</p></div>';
        }
      },
      error: function (xhr, status, error) {
        resultsContainer.innerHTML = '<div class="dqm-card"><p>Error loading quality results: ' + error + '</p></div>';
      }
    });
  }
  
  function displayQualityResults(data, container) {
    if (!data || !data.checkpoints || !Array.isArray(data.checkpoints)) {
      container.innerHTML = '<div class="dqm-card"><p>No quality results available.</p></div>';
      return;
    }
    
    var checkpoints = data.checkpoints;
    var passedCount = 0;
    var totalCount = checkpoints.length;
    var failedCheckpoints = [];
    var topicCounts = {};

    checkpoints.forEach(function (checkpoint) {
      if (checkpoint.status === 'passed') {
        passedCount++;
      } else {
        failedCheckpoints.push(checkpoint);
      }
      
      if (checkpoint.topics && Array.isArray(checkpoint.topics)) {
        checkpoint.topics.forEach(function (topic) {
          if (!topicCounts[topic]) {
            topicCounts[topic] = { total: 0, passed: 0 };
          }
          topicCounts[topic].total++;
          if (checkpoint.status === 'passed') {
            topicCounts[topic].passed++;
          }
        });
      }
    });
    
    var percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
    var html = '';
    
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
      
      var topicColors = {
        'Accessibility': '#ff5630',
        'SEO': '#ff8b00',
        'Brand': '#0052cc',
        'Regulatory': '#b604d4',
        'Legal': '#6d6d6d',
        'Usability': '#36b37e'
      };
      
      Object.keys(topicCounts).forEach(function (topic, index) {
        var counts = topicCounts[topic];
        var topicPercent = counts.total > 0 ? Math.round((counts.passed / counts.total) * 100) : 0;
        var color = topicColors[topic] || '#888';
        
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
      html += '<div class="dqm-card">';
      html += '<h3>❌ Failed Checkpoints (' + failedCheckpoints.length + ')</h3>';
      html += '<div class="dqm-checkpoints-list">';
      failedCheckpoints.forEach(function (checkpoint, idx) {
        html += '<div class="dqm-checkpoint-item">';
        html += '<div class="checkpoint-icon-title-row">';
        // Use a red circle with exclamation mark, matching WordPress
        html += '<div class="checkpoint-icon failed dqm-info-icon" data-idx="' + idx + '" style="cursor:pointer;">!</div>';
        html += '<div>';
        html += '<span class="checkpoint-title">' + (checkpoint.name || 'Unknown Checkpoint') + '</span>';
        if (Array.isArray(checkpoint.topics) && checkpoint.topics.length > 0) {
          html += '<div class="checkpoint-badges" style="display:flex;margin-top:4px;">';
          checkpoint.topics.forEach(function(topic) {
            var badgeClass = (topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
    
    container.innerHTML = html;
    
    // Modal logic for info icon
    var modal = document.getElementById('dqm-checkpoint-modal');
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
      var title = document.createElement('div');
      title.className = 'dqm-modal-title';
      title.textContent = cp.name || '';
      modal.appendChild(title);
      if (cp.description) {
        var desc = document.createElement('div');
        desc.className = 'dqm-modal-desc';
        desc.textContent = cp.description;
        modal.appendChild(desc);
      }
      if (Array.isArray(cp.topics) && cp.topics.length > 0) {
        var topicsDiv = document.createElement('div');
        topicsDiv.className = 'dqm-modal-topics';
        topicsDiv.innerHTML = cp.topics.map(function(topic) {
          var badgeClass = (topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return '<span class="badge ' + badgeClass + '">' + topic + '</span>';
        }).join(' ');
        modal.appendChild(topicsDiv);
      }
      modal.style.display = 'block';
      modal.style.opacity = '1';
      // Always position modal at top right
      modal.style.top = '32px';
      modal.style.left = '32px';
      modal.style.right = '';
    }
    var infoIcons = container.querySelectorAll('.dqm-info-icon');
    infoIcons.forEach(function(icon) {
      icon.addEventListener('mouseenter', function(e) {
        var idx = parseInt(icon.getAttribute('data-idx'), 10);
        var cp = failedCheckpoints[idx];
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
  }

  function extractPreviewContent() {
    var contentSelectors = [
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
    
    var contentElement = null;
    
    for (var i = 0; i < contentSelectors.length; i++) {
      contentElement = document.querySelector(contentSelectors[i]);
      if (contentElement) {
        break;
      }
    }
    
    if (!contentElement) {
      return extractCleanBodyContent();
    }
    var contentClone = contentElement.cloneNode(true);
    
    removeAdminElements(contentClone);
    
    var cleanHtml = createCleanHtmlStructure(contentClone.outerHTML);
    
    return cleanHtml;
  }

  function extractRegularPageContent() {
    var html = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!html) {
      return extractCleanBodyContent();
    }
    
    var htmlClone = html.cloneNode(true);
    
    removeAdminElements(htmlClone);
    
    var cleanHtml = createCleanHtmlStructure(htmlClone.innerHTML);
    
    return cleanHtml;
  }

  function extractCleanBodyContent() {
    var bodyClone = document.body.cloneNode(true);
    removeAdminElements(bodyClone);
    
    var cleanHtml = createCleanHtmlStructure(bodyClone.innerHTML);
    return cleanHtml;
  }

  function removeAdminElements(element) {
    var adminSelectors = [
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
      '.crownpeak-dqm-toolbar-item',
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
    
    var removedCount = 0;
    
    adminSelectors.forEach(function(selector) {
      var elements = element.querySelectorAll(selector);
      elements.forEach(function(el) {
        el.remove();
        removedCount++;
      });
    });
    
    var allElements = element.querySelectorAll('*');
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
    var pageTitle = document.title || 'Page Content';
    
    var metaDescription = '';
    var descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      metaDescription = '<meta name="description" content="' + descMeta.getAttribute('content') + '">';
    }
    
    var lang = document.documentElement.lang || 'en';
    
    var cleanHtml = '<!DOCTYPE html>\n' +
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