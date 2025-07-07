(function ($, Drupal, once) {
  Drupal.behaviors.crownpeakDqmToolbar = {
    attach: function (context, settings) {
      once('crownpeak-dqm', '.crownpeak-dqm-run-quality-check', context).forEach(function (el) {
        $(el).on('click', function () {
          // Prevent duplicate submissions
          if ($(this).data('submitting')) {
            return;
          }
          $(this).data('submitting', true);
          
          // Extract the main page HTML as a string
          var html = document.querySelector('.dialog-off-canvas-main-canvas');
          if (!html) {
            $(this).data('submitting', false);
            return;
          }
          var content = html.outerHTML;
          
          // Check for existing asset ID for this page
          var pageUrl = window.location.href;
          var assetKey = 'dqm_asset_id_' + btoa(pageUrl);
          var existingAssetId = localStorage.getItem(assetKey);
          
          // Prepare data with existing asset ID if available
          var requestData = { content: content };
          if (existingAssetId) {
            requestData.assetId = existingAssetId;
          }
          
          // Send AJAX request to Drupal endpoint
          $.ajax({
            url: Drupal.url('crownpeak-dqm/scan'),
            method: 'POST',
            data: requestData,
            dataType: 'json',
            success: function (data) {
              // Reset submitting flag
              $(el).data('submitting', false);
              
              if (data.success) {
                // Store asset ID in localStorage for this page
                localStorage.setItem(assetKey, data.assetId);
                alert('Scan successful! Asset ID: ' + data.assetId);
                
                // Fetch and display quality results
                fetchQualityResults(data.assetId, el);
              } else {
                alert('Scan failed: ' + (data.message || 'Unknown error'));
              }
            },
            error: function (xhr, status, error) {
              // Reset submitting flag on error
              $(el).data('submitting', false);
              alert('AJAX error: ' + error);
            }
          });
        });
      });
    }
  };
  
  // Function to fetch and display quality results
  function fetchQualityResults(assetId, buttonElement) {
    // Create or get results container
    var resultsContainer = document.getElementById('dqm-results-container');
    if (!resultsContainer) {
      resultsContainer = document.createElement('div');
      resultsContainer.id = 'dqm-results-container';
      resultsContainer.className = 'dqm-results-container';
      buttonElement.parentNode.insertBefore(resultsContainer, buttonElement.nextSibling);
    }
    
    // Show loading state
    resultsContainer.innerHTML = '<div class="dqm-loading">Loading quality results...</div>';
    
    // Fetch results from API
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
  
  // Function to display quality results
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
    
    // Process checkpoints data
    checkpoints.forEach(function (checkpoint) {
      if (checkpoint.status === 'passed') {
        passedCount++;
      } else {
        failedCheckpoints.push(checkpoint);
      }
      
      // Count by topics
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
    
    // Generate HTML
    var html = '';
    
    // Score card
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
    
    // Topic breakdown
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
    
    // Failed checkpoints
    if (failedCheckpoints.length > 0) {
      html += '<div class="dqm-card">';
      html += '<h3>❌ Failed Checkpoints (' + failedCheckpoints.length + ')</h3>';
      html += '<div class="dqm-checkpoints-list">';
      
      failedCheckpoints.forEach(function (checkpoint) {
        html += '<div class="dqm-checkpoint-item">';
        html += '<div class="dqm-checkpoint-icon failed">✗</div>';
        html += '<div>';
        html += '<strong>' + (checkpoint.name || 'Unknown Checkpoint') + '</strong>';
        if (checkpoint.description) {
          html += '<br><small>' + checkpoint.description + '</small>';
        }
        html += '</div>';
        html += '</div>';
      });
      
      html += '</div>';
      html += '</div>';
    }
    
    container.innerHTML = html;
    
    // Update pie chart
    var pieChart = container.querySelector('.dqm-pie-chart');
    if (pieChart) {
      var passedAngle = totalCount > 0 ? (passedCount / totalCount) * 360 : 0;
      pieChart.style.background = 'conic-gradient(#b604d4 0deg ' + passedAngle + 'deg, #303747 ' + passedAngle + 'deg 360deg)';
    }
  }
})(jQuery, Drupal, window.once);