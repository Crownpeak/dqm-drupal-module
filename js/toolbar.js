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

          $document.on('click', '.dqm-drupal-module-source-button', function () {
            try {
              showSourceModal(this);
            } catch (e) {
              alert('Error showing source: ' + e.message);
            }
          });

          $document.on('click', '.dqm-drupal-module-page-highlight', function () {
            try {
              togglePageHighlight(this);
            } catch (e) {
              alert('Error toggling page highlight: ' + e.message);
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
      beforeSend: function (xhr, settings) { },
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

    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
    }
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
        if (response && response.success && response.data && response.data.html) {
          resetButtonState(buttonElement);
          resultsContainer.innerHTML = response.data.html;
        } else if (response.success && response.data) {
          $.ajax({
            url: Drupal.url('dqm-drupal-module/asset-status/' + assetId),
            method: 'GET',
            dataType: 'json',
            success: function (statusData) {
              if (statusData && Array.isArray(statusData.checkpoints)) {
                var canHighlightMap = {};
                statusData.checkpoints.forEach(function (cp) {
                  if (cp && cp.id) {
                    canHighlightMap[cp.id] = cp.canHighlight && typeof cp.canHighlight.page !== 'undefined' ? cp.canHighlight.page : undefined;
                  }
                });
                if (response.data && Array.isArray(response.data.checkpoints)) {
                  response.data.checkpoints.forEach(function (cp) {
                    if (cp && cp.id && typeof canHighlightMap[cp.id] !== 'undefined') {
                      cp._canHighlightPage = canHighlightMap[cp.id];
                    }
                  });
                }
              }
              resetButtonState(buttonElement);
              displayQualityResults(response.data, resultsContainer);
            },
            error: function () {
              resetButtonState(buttonElement);
              displayQualityResults(response.data, resultsContainer);
            }
          });
        } else {
          resetButtonState(buttonElement);
          console.warn('[DQM] Failed to load quality results:', response.message || 'Unknown error');
          resultsContainer.innerHTML = '<div class="dqm-card"><p>Failed to load quality results: ' + (response.message || 'Unknown error') + '</p></div>';
        }
      },
      error: function (xhr, status, error) {
        console.error('[DQM] AJAX error loading quality results:', error, xhr, status);
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

  function displayQualityResults(data, container) {
    if (!data || !data.checkpoints || !Array.isArray(data.checkpoints)) {
      container.innerHTML = '<div class="dqm-card"><p>No quality results available.</p></div>';
      return;
    }

    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
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
        let cannotHighlightHtml = '';
        let notHighlightable = false;

        if (checkpoint.hasOwnProperty('_canHighlightPage') && checkpoint._canHighlightPage === false &&
            checkpoint.canHighlight && checkpoint.canHighlight.source === false) {
          cannotHighlightHtml = '<span class="dqm-cannot-highlight">Cannot highlight</span>';
          notHighlightable = true;
        }
        else if (checkpoint.canHighlight && 
                checkpoint.canHighlight.page === false && 
                checkpoint.canHighlight.source === false) {
          cannotHighlightHtml = '<span class="dqm-cannot-highlight">Cannot highlight</span>';
          notHighlightable = true;
        }
        let notClickableClass = notHighlightable ? ' not-highlightable' : '';
        failedCheckpointsHtml += `<div class="dqm-checkpoint-item${notClickableClass} ${topicClasses}" data-topics="${checkpoint.topics.join(',')}" data-error-id="${checkpoint.id}">
          <div class="checkpoint-icon-title-row">
            <div class="checkpoint-icon failed dqm-info-icon" data-id="${checkpoint.id}">!</div>
            <div>
              <span class="checkpoint-title">${checkpoint.name || 'Unknown Checkpoint'}</span>
              ${checkpointBadgesHtml}
              ${cannotHighlightHtml}
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

    setTimeout(function () {
      const checkpointItems = container.querySelectorAll('.dqm-checkpoint-item[data-error-id]');
      checkpointItems.forEach(function (item) {
        if (item.classList.contains('not-highlightable')) {
          return;
        }
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          const isActive = this.classList.contains('active');
          if (isActive) {
            this.classList.remove('active');
            hideSourceButton();
            document.querySelectorAll('.dqm-element-highlight').forEach(function (el) {
              el.classList.remove('dqm-element-highlight');
              if (el.hasAttribute('data-dqm-original-style')) {
                el.setAttribute('style', el.getAttribute('data-dqm-original-style'));
                el.removeAttribute('data-dqm-original-style');
              } else {
                el.removeAttribute('style');
              }
            });
            
            const mainCanvas = document.querySelector('.dialog-off-canvas-main-canvas');
            if (mainCanvas && mainCanvas.hasAttribute('data-original-content')) {
              const originalContent = mainCanvas.getAttribute('data-original-content');
              mainCanvas.innerHTML = originalContent;
              mainCanvas.removeAttribute('data-original-content');
              
              const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
              if (sourceButton) {
                setButtonText($(sourceButton), 'Source');
              }
            }
            
            return;
          }
          
          checkpointItems.forEach(function (i) { i.classList.remove('active'); });
          this.classList.add('active');
          
          const errorId = this.getAttribute('data-error-id');
          const checkpoint = failedCheckpoints.find(cp => cp.id === errorId);
          
          document.querySelectorAll('.dqm-element-highlight').forEach(function (el) {
            el.classList.remove('dqm-element-highlight');
            if (el.hasAttribute('data-dqm-original-style')) {
              el.setAttribute('style', el.getAttribute('data-dqm-original-style'));
              el.removeAttribute('data-dqm-original-style');
            } else {
              el.removeAttribute('style');
            }
          });
          
          if (checkpoint && checkpoint.canHighlight) {
            if (
              checkpoint.canHighlight.source === true &&
              checkpoint.canHighlight.page === false
            ) {
              hideSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                !mainCanvas.hasAttribute("data-original-content")
              ) {
                mainCanvas.setAttribute(
                  "data-original-content",
                  mainCanvas.innerHTML
                );
              }
              showSourceModalWithHighlight(
                document.querySelector(".dqm-drupal-module-source-button"),
                errorId
              );
              return;
            } else if (
              checkpoint.canHighlight.source === true &&
              checkpoint.canHighlight.page === true
            ) {
              showSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                mainCanvas.hasAttribute("data-original-content")
              ) {
                const originalContent = mainCanvas.getAttribute(
                  "data-original-content"
                );
                mainCanvas.innerHTML = originalContent;
                mainCanvas.removeAttribute("data-original-content");

                const sourceButton = document.querySelector(
                  ".dqm-drupal-module-source-button"
                );
                if (sourceButton) {
                  setButtonText($(sourceButton), "Source");
                }
              }
            } else {
              hideSourceButton();
              const mainCanvas = document.querySelector(
                ".dialog-off-canvas-main-canvas"
              );
              if (
                mainCanvas &&
                mainCanvas.hasAttribute("data-original-content")
              ) {
                const originalContent = mainCanvas.getAttribute(
                  "data-original-content"
                );
                mainCanvas.innerHTML = originalContent;
                mainCanvas.removeAttribute("data-original-content");
              }
            }
          }
          
          if (!errorId) return;
          const assetKey = 'dqm_asset_id_' + btoa(window.location.href);
          const assetId = localStorage.getItem(assetKey);
          if (!assetId) {
            alert('No asset ID found for this page. Please run a quality check first.');
            return;
          }
          if (checkpoint && checkpoint.canHighlight && 
              checkpoint.canHighlight.source === true && 
              checkpoint.canHighlight.page === false) {
            return;
          }
          
          $.ajax({
            url: Drupal.url('dqm-drupal-module/error-highlight/' + assetId + '/' + errorId),
            method: 'GET',
            dataType: 'json',
            success: function (response) {
              if (typeof response === 'object' && response !== null && response.message) {
                var lowerMsg = response.message.toLowerCase().trim();
                if (lowerMsg.includes('unsupported for checkpoint')) {
                  const checkpoint = failedCheckpoints.find(cp => cp.id === errorId);
                  if (checkpoint && checkpoint.canHighlight && checkpoint.canHighlight.source === true) {
                    return;
                  } else {
                    alert('Highlighting is unsupported for this specific checkpoint.');
                    return;
                  }
                } else if (lowerMsg.includes('unsupported')) {
                  alert(response.message);
                  return;
                }
              }
              if (!response.success || !response.html) {
                alert('Failed to fetch highlight for this error.');
                return;
              }
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = response.html;
              const highlightEl = tempDiv.querySelector('[style*="background:yellow"], [style*="background: yellow"], [style*="background-color:yellow"], [style*="background-color: yellow"]');
              
              if (highlightEl) {
                let found = false;
                const highlightStyle = 'background: yellow !important; border: 2px solid red !important;';

                let textToFind = highlightEl.textContent.trim();
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                  if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName)) {
                    continue;
                  }
                  
                  if (el.textContent.trim() === textToFind) {
                    if (!el.hasAttribute('data-dqm-original-style')) {
                      el.setAttribute('data-dqm-original-style', el.getAttribute('style') || '');
                    }
                    el.setAttribute('style', (el.getAttribute('style') || '') + '; ' + highlightStyle);
                    el.classList.add('dqm-element-highlight');
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  
                  const innerElements = highlightEl.querySelectorAll('*');
                  for (const innerEl of innerElements) {
                    const innerText = innerEl.textContent.trim();
                    if (innerText.length > 10) {
                      const tagName = innerEl.tagName;
                      
                      for (const pageEl of allElements) {
                        if (pageEl.tagName === tagName && 
                            pageEl.textContent.trim() === innerText &&
                            !['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(pageEl.tagName)) {
                          if (!pageEl.hasAttribute('data-dqm-original-style')) {
                            pageEl.setAttribute('data-dqm-original-style', pageEl.getAttribute('style') || '');
                          }
                          pageEl.setAttribute('style', (pageEl.getAttribute('style') || '') + '; ' + highlightStyle);
                          pageEl.classList.add('dqm-element-highlight');
                          found = true;
                          break;
                        }
                      }
                      if (found) break;
                    }
                  }
                }
                if (!found) {
                  const words = textToFind.split(' ').filter(word => word.length > 3);
                  if (words.length > 0) {
                    let bestMatch = null;
                    let bestScore = 0;
                    
                    for (const el of allElements) {   
                     
                      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(el.tagName)) {
                        continue;
                      }
                      
                      const elText = el.textContent.trim();
                      if (elText.length > 10) {
                        let score = 0;
                        for (const word of words) {
                          if (elText.toLowerCase().includes(word.toLowerCase())) {
                            score++;
                          }
                        }
                        const similarity = score / words.length;
                        if (similarity > bestScore && similarity > 0.6) {
                          bestScore = similarity;
                          bestMatch = el;
                        }
                      }
                    }
                    
                    if (bestMatch) {
                      if (!bestMatch.hasAttribute('data-dqm-original-style')) {
                        bestMatch.setAttribute('data-dqm-original-style', bestMatch.getAttribute('style') || '');
                      }
                      bestMatch.setAttribute('style', (bestMatch.getAttribute('style') || '') + '; ' + highlightStyle);
                      bestMatch.classList.add('dqm-element-highlight');
                      found = true;
                    }
                  }
                }
                
                if (!found) {
                  alert('Could not find the matching content to highlight on this page.');
                }
              } else {
                alert('No highlightable element found in the API response.');
              }
            },
            error: function (xhr) {
              let msg = 'Failed to fetch highlight for this error.';
              if (xhr && xhr.status === 400 && xhr.responseText) {
                try {
                  var errObj = JSON.parse(xhr.responseText);
                  if (errObj && errObj.message) {
                    var lowerMsg = errObj.message.toLowerCase().trim();
                    if (lowerMsg.includes('unsupported for checkpoint')) {
                      return;
                    } else if (lowerMsg.includes('unsupported')) {
                      msg = errObj.message;
                    }
                  }
                } catch (e) { }
              }
              alert(msg);
            }
          });
        });
      });
    }, 0);

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
      if (cp.topics.length > 0) {
        const topicsDiv = document.createElement('div');
        topicsDiv.className = 'dqm-modal-topics';
        topicsDiv.innerHTML = cp.topics.map(topic => {
          const badgeClassName = topicCounts[topic] ? topicCounts[topic].className : '';
          return `<span class="badge ${badgeClassName}">${topic}</span>`;
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
    for (const icon of infoIcons) {
      icon.addEventListener('mouseenter', function (e) {
        const id = icon.getAttribute('data-id');
        const cp = failedCheckpoints.find(cp => cp.id === id);
        if (cp) {
          showModal(cp);
        }
      });
      icon.addEventListener('mouseleave', function (e) {
        setTimeout(function () {
          modal.style.display = 'none';
        }, 200);
      });
    }
    modal.addEventListener('mouseenter', function () {
      modal.style.display = 'block';
    });
    modal.addEventListener('mouseleave', function () {
      modal.style.display = 'none';
    });

    const filterSelect = container.querySelector('#dqm-topics-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function (e) {
        const selectedTopic = e.target.value;
        const checkpointItems = container.querySelectorAll('.dqm-checkpoint-item');
        let visibleCount = 0;

        checkpointItems.forEach(function (item) {
          if (selectedTopic === 'all') {
            item.style.display = 'flex';
            visibleCount++;
          } else {
            const itemTopics = item.getAttribute('data-topics') || '';
            const topicArray = itemTopics.split(',').map(function (topic) {
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
    const pageHighlightBtn = container.querySelector('.dqm-drupal-module-page-highlight');
    if (pageHighlightBtn) {
      pageHighlightBtn.addEventListener('click', function () {
        try {
          togglePageHighlight(this);
        } catch (e) {
          alert('Error toggling page highlight: ' + e.message);
        }
      });
    }

    window.dqmFailedCheckpoints = failedCheckpoints
  }

  function showSourceButton() {
    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.add('dqm-source-visible');
      sourceButton.style.display = 'block';
    }
  }

  function hideSourceButton() {
    const sourceButton = document.querySelector('.dqm-drupal-module-source-button');
    if (sourceButton) {
      sourceButton.classList.remove('dqm-source-visible');
      sourceButton.style.display = 'none';
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

    for (const selector of adminSelectors) {
      const elements = element.querySelectorAll(selector);
      for (const el of elements) {
        el.remove();
        removedCount++;
      }
    }

    const allElements = element.querySelectorAll('*');
    for (const el of allElements) {
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
    }

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

  function addLocalHighlighting() {
    if (!$('#dqm-highlight-styles').length) {
      $('head').append('<style id="dqm-highlight-styles">' +
        '.dqm-element-highlight { outline: 2px dashed #b604d4 !important; outline-offset: 2px !important; }' +
        '.dqm-element-highlight:hover { outline: 3px solid #b604d4 !important; }' +
        '</style>');
    }
    $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
  }

  function togglePageHighlight(buttonElement) {
    try {
      const $button = $(buttonElement);
      const isHighlightActive = $button.hasClass('active');

      if (isHighlightActive) {
        $('.dqm-element-highlight').each(function () {
          $(this).removeClass('dqm-element-highlight');
        });

        $('#dqm-highlight-overlay').remove();
        $('#dqm-highlight-styles').remove();

        $button.removeClass('active');
        $button.val(Drupal.t('Page Highlight'));
      } else {
        $button.prop('disabled', true);

        const currentUrl = window.location.href;
        const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
        const existingAssetId = localStorage.getItem(assetKey);

        if (!existingAssetId) {
          addLocalHighlighting();
          $button.addClass('active');
          $button.val(Drupal.t('Page Highlighting'));
          $button.prop('disabled', false);
          return;
        }

        let apiKey;
        try {
          if (drupalSettings && drupalSettings.dqmDrupalModule && drupalSettings.dqmDrupalModule.apiKey) {
            apiKey = drupalSettings.dqmDrupalModule.apiKey;
          } else {
            console.warn('API key not found in drupalSettings');
            addLocalHighlighting();
            $button.addClass('active');
            $button.val(Drupal.t('Page Highlighting'));
            $button.prop('disabled', false);
            return;
          }
        } catch (e) {
          console.warn('Error accessing drupalSettings:', e);
          addLocalHighlighting();
          $button.addClass('active');
          $button.val(Drupal.t('Remove Highlight'));
          resetButtonState($button);
          return;
        }

        $.ajax({
          url: Drupal.url('dqm-drupal-module/highlight/' + existingAssetId),
          method: 'GET',
          data: {
            visibility: 'public'
          },
          contentType: 'text/html',
          success: function (response) {
            try {
              if (!$('#dqm-highlight-styles').length) {
                $('head').append('<style id="dqm-highlight-styles">' +
                  '.dqm-element-highlight { outline: 2px dashed #b604d4 !important; outline-offset: 2px !important; }' +
                  '.dqm-element-highlight:hover { outline: 3px solid #b604d4 !important; }' +
                  '</style>');
              }

              const tempDiv = document.createElement('div');
              tempDiv.style.display = 'none';
              tempDiv.innerHTML = response;
              document.body.appendChild(tempDiv);

              let foundElements = false;

              $(tempDiv).find('.dqm-element-highlight').each(function () {
                const tagName = this.tagName.toLowerCase();
                const text = $(this).text().trim();

                if (text) {
                  $(`${tagName}`).each(function () {
                    if ($(this).text().trim() === text) {
                      $(this).addClass('dqm-element-highlight');
                      foundElements = true;
                    }
                  });
                }
              });

              if (!foundElements) {
                console.log('No matching elements found, applying fallback highlighting');
                $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
              }

              document.body.removeChild(tempDiv);

              $button.addClass('active');
              $button.val(Drupal.t('Page Highlighting'));
            } catch (e) {
              console.error('Error processing highlight response:', e);
              alert('Error processing highlight data: ' + e.message);
              $('main h1, main h2, main h3, main h4, main h5, main h6, main p, main img, main figure, main table, main ul, main ol, article h1, article h2, article h3, article h4, article h5, article h6, article p, article img, article figure, article table, article ul, article ol').addClass('dqm-element-highlight');
            }
            $button.prop('disabled', false);
          },
          error: function (xhr, status, error) {
            console.error('API error:', xhr, status, error);
            addLocalHighlighting();
            $button.addClass('active');
            $button.val(Drupal.t('Page Highlighting'));
            $button.prop('disabled', false);
          }
        });
      }
    } catch (e) {
      console.error('Error in togglePageHighlight:', e);
      alert('Error toggling page highlight: ' + e.message);
      resetButtonState($(buttonElement));
    }
  }

  function showSourceModal(buttonElement) {
  try {
    const $button = $(buttonElement);
    if ($button.data('loading')) {
      return;
    }

    const mainCanvas = document.querySelector('.dialog-off-canvas-main-canvas');
    if (!mainCanvas) {
      alert('Main canvas area not found');
      return;
    }

    const isShowingSource = mainCanvas.hasAttribute('data-original-content');

    const activeCheckpoint = document.querySelector('.dqm-checkpoint-item.active');
    let isSourceOnly = false;
    let shouldHighlightError = false;
    let activeErrorId = null;
    
    if (activeCheckpoint) {
      const errorId = activeCheckpoint.getAttribute('data-error-id');
      const checkpoint = window.dqmFailedCheckpoints?.find(cp => cp.id === errorId);
      if (checkpoint && checkpoint.canHighlight) {
        if (checkpoint.canHighlight.source === true && checkpoint.canHighlight.page === false) {
          isSourceOnly = true;
        } else if (checkpoint.canHighlight.source === true && checkpoint.canHighlight.page === true) {
          shouldHighlightError = true;
          activeErrorId = errorId;
        }
      }
    }

    if (isShowingSource && !isSourceOnly) {
      const originalContent = mainCanvas.getAttribute('data-original-content');
      if (originalContent) {
        mainCanvas.innerHTML = originalContent;
        mainCanvas.removeAttribute('data-original-content');
        setButtonText($button, 'Source');
      }
      return;
    }

    const currentUrl = window.location.href;
    const assetKey = 'dqm_asset_id_' + btoa(currentUrl);
    const existingAssetId = localStorage.getItem(assetKey);

    if (!existingAssetId) {
      alert('No asset ID found for this page. Please run a quality check first.');
      return;
    }

    $button.data('loading', true);
    $button.prop('disabled', true);
    setButtonText($button, 'Loading...');

    if (!isSourceOnly) {
      mainCanvas.setAttribute('data-original-content', mainCanvas.innerHTML);
    }

    mainCanvas.innerHTML = `
      <div class="dqm-source-container">
        <div class="dqm-source-loading">
          <span class="dqm-spinner"></span>
          Loading source code...
        </div>
        <div class="dqm-source-code" style="display: none;"></div>
      </div>
    `;

    let endpoint, loadingText;
    if (shouldHighlightError && activeErrorId) {
      endpoint = Drupal.url('dqm-drupal-module/error-highlight-source/' + existingAssetId + '/' + activeErrorId);
      loadingText = 'Loading highlighted source code...';
    } else {
      endpoint = Drupal.url('dqm-drupal-module/source/' + existingAssetId);
      loadingText = 'Loading source code...';
    }
    const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
    if (loadingElement) {
      loadingElement.innerHTML = `<span class="dqm-spinner"></span>${loadingText}`;
    }

    $.ajax({
      url: endpoint,
      method: 'GET',
      dataType: 'json',
      success: function (response) {
        try {
          if (response && response.success && response.html) {
            const codeElement = mainCanvas.querySelector('.dqm-source-code');
            const loadingElement = mainCanvas.querySelector('.dqm-source-loading');

            if (codeElement && loadingElement) {
              if (shouldHighlightError && activeErrorId) {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = response.html;
              } else {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = `<pre style="font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; white-space: pre-wrap; margin: 0;">${response.html}</pre>`;
              }
              
              loadingElement.style.display = 'none';
              codeElement.style.display = 'block';
              
              if (isSourceOnly) {
                setButtonText($button, 'Source');
              } else {
                setButtonText($button, 'Browser');
              }
              if (shouldHighlightError && activeErrorId) {
                setTimeout(function() {
                  scrollToHighlightedCode(mainCanvas);
                }, 200);
              }
            }
          } else {
            const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
            if (loadingElement) {
              loadingElement.innerHTML = 'Error: ' + (response.message || 'Failed to load source');
            }
          }
        } catch (e) {
          const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
          if (loadingElement) {
            loadingElement.innerHTML = 'Error processing response: ' + e.message;
          }
        }
      },
      error: function (xhr, status, error) {
        const loadingElement = mainCanvas.querySelector('.dqm-source-loading');
        if (loadingElement) {
          loadingElement.innerHTML = 'Error loading source: ' + error;
        }
      },
      complete: function () {
        $button.data('loading', false);
        $button.prop('disabled', false);
      }
    });

  } catch (e) {
    alert('Error showing source: ' + e.message);
    const $button = $(buttonElement);
    $button.data('loading', false);
    $button.prop('disabled', false);
    if (!isSourceOnly) {
      const originalContent = mainCanvas.getAttribute('data-original-content');
      if (originalContent) {
        mainCanvas.innerHTML = originalContent;
        mainCanvas.removeAttribute('data-original-content');
        setButtonText($button, 'Source');
      }
    }
  }
}

  function showSourceModalWithHighlight(buttonElement, errorId) {
    try {
      const $button = $(buttonElement);
      if ($button.data("loading")) {
        return;
      }

      const mainCanvas = document.querySelector(
        ".dialog-off-canvas-main-canvas"
      );
      if (!mainCanvas) {
        alert("Main canvas area not found");
        return;
      }

      const currentUrl = window.location.href;
      const assetKey = "dqm_asset_id_" + btoa(currentUrl);
      const existingAssetId = localStorage.getItem(assetKey);

      if (!existingAssetId) {
        alert(
          "No asset ID found for this page. Please run a quality check first."
        );
        return;
      }

      $button.data("loading", true);
      $button.prop("disabled", true);
      setButtonText($button, "Loading...");
      if (!mainCanvas.hasAttribute("data-original-content")) {
        mainCanvas.setAttribute("data-original-content", mainCanvas.innerHTML);
      }

      mainCanvas.innerHTML = `
      <div class="dqm-source-container">
        <div class="dqm-source-loading">
          <span class="dqm-spinner"></span>
          Loading highlighted source code...
        </div>
        <div class="dqm-source-code" style="display: none;"></div>
      </div>
    `;

      $.ajax({
        url: Drupal.url(
          "dqm-drupal-module/error-highlight-source/" +
            existingAssetId +
            "/" +
            errorId
        ),
        method: "GET",
        dataType: "json",
        success: function (response) {
          try {
            if (response && response.success && response.html) {
              const codeElement = mainCanvas.querySelector(".dqm-source-code");
              const loadingElement = mainCanvas.querySelector(
                ".dqm-source-loading"
              );

              if (codeElement && loadingElement) {
                const shadow = codeElement.attachShadow({ mode: "open" });
                shadow.innerHTML = response.html;
                loadingElement.style.display = "none";
                codeElement.style.display = "block";

                setButtonText($button, "Browser");
                setTimeout(function() {
                  scrollToHighlightedCode(mainCanvas);
                }, 100);
              }
            } else {
              const loadingElement = mainCanvas.querySelector(
                ".dqm-source-loading"
              );
              if (loadingElement) {
                loadingElement.innerHTML =
                  "Error: " +
                  (response.message || "Failed to load highlighted source");
              }
            }
          } catch (e) {
            const loadingElement = mainCanvas.querySelector(
              ".dqm-source-loading"
            );
            if (loadingElement) {
              loadingElement.innerHTML =
                "Error processing response: " + e.message;
            }
          }
        },
        error: function (xhr, status, error) {
          const loadingElement = mainCanvas.querySelector(
            ".dqm-source-loading"
          );
          if (loadingElement) {
            loadingElement.innerHTML =
              "Error loading highlighted source: " + error;
          }
        },
        complete: function () {
          $button.data("loading", false);
          $button.prop("disabled", false);
        },
      });
    } catch (e) {
      alert("Error showing highlighted source: " + e.message);
      const $button = $(buttonElement);
      $button.data("loading", false);
      $button.prop("disabled", false);
    }
  }

  function scrollToHighlightedCode(container) {
    try {
      let highlightedElement = null;

      highlightedElement = container.querySelector("tr.astError, td.astError");

      if (!highlightedElement) {
        const errorIconCells = container.querySelectorAll("td.errorIcon");
        errorIconCells.forEach((cell) => {
          if (cell.innerHTML !== "&nbsp;" && cell.innerHTML.trim() !== "") {
            highlightedElement = cell.closest("tr");
          }
        });
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          "td.content span.astError, td.content span.astHighlightFull"
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          ".astError.astHighlightFull, .astError, .astHighlightFull"
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          '[style*="background:yellow"], [style*="background-color:yellow"], [style*="background: yellow"]'
        );
      }

      if (!highlightedElement) {
        highlightedElement = container.querySelector(
          'span[style*="background"], td[style*="background"]'
        );
      }

      if (
        highlightedElement &&
        (highlightedElement.tagName === "SPAN" ||
          highlightedElement.tagName === "TD")
      ) {
        const parentRow = highlightedElement.closest("tr");
        if (parentRow) {
          highlightedElement = parentRow;
        }
      }

      if (highlightedElement) {
        const sourceContainer =
          container.querySelector(".dqm-source-code, pre, #sourceViewTable") ||
          container;

        const elementRect = highlightedElement.getBoundingClientRect();
        const containerRect = sourceContainer.getBoundingClientRect();

        let scrollTop;
        if (sourceContainer.scrollTop !== undefined) {
          scrollTop =
            elementRect.top -
            containerRect.top +
            sourceContainer.scrollTop -
            100;
        } else {
          scrollTop = highlightedElement.offsetTop - 100;
        }

        if (sourceContainer.scrollTo) {
          sourceContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        } else if (sourceContainer.scrollTop !== undefined) {
          sourceContainer.scrollTop = Math.max(0, scrollTop);
        } else {
          container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: "smooth",
          });
        }

        highlightedElement.style.transition = "background-color 0.3s ease";
        const originalBackground = highlightedElement.style.backgroundColor;
        highlightedElement.style.backgroundColor = "rgba(182, 4, 212, 0.2)";

        setTimeout(function () {
          if (highlightedElement.style) {
            highlightedElement.style.backgroundColor = originalBackground;
            highlightedElement.style.transition = "";
          }
        }, 2000);
      }
    } catch (e) {
      console.error("Error scrolling to highlighted code:", e);
    }
  }


  window.dqmFailedCheckpoints = [];

})(jQuery, Drupal, window.once);