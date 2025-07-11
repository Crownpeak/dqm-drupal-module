<?php
namespace Drupal\crownpeak_dqm\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

class ToolbarTrayController extends ControllerBase {
  /**
   * Returns the tray content for the Crownpeak DQM toolbar tab.
   */
  public function tray() {
    $current_path = \Drupal::request()->getPathInfo();
    $is_preview = (strpos($current_path, '/node/preview/') !== false || strpos($current_path, '/preview/') !== false);
    
    $build = [
      '#type' => 'container',
      '#attributes' => ['class' => ['crownpeak-dqm-toolbar-tray']],
    ];
    
    if ($is_preview) {
      $build['preview_notice'] = [
        '#type' => 'markup',
        '#markup' => '<div class="dqm-preview-notice"><strong>Preview Mode Detected</strong><br>Enhanced content extraction for preview content.</div>',
      ];
      
      $build['run_quality_check'] = [
        '#type' => 'button',
        '#value' => $this->t('Scan Preview Content'),
        '#attributes' => [
          'class' => ['crownpeak-dqm-run-quality-check', 'button--primary'],
          'title' => $this->t('Extract and scan the preview content without admin elements'),
        ],
      ];
      
      $build['scan_url'] = [
        '#type' => 'button',
        '#value' => $this->t('Server-Side Scan'),
        '#attributes' => [
          'class' => ['crownpeak-dqm-scan-url', 'button--small'],
          'title' => $this->t('Render content on server and scan (recommended for preview pages)'),
        ],
      ];
    } else {
      $build['run_quality_check'] = [
        '#type' => 'button',
        '#value' => $this->t('Run Quality Check'),
        '#attributes' => [
          'class' => ['crownpeak-dqm-run-quality-check'],
        ],
      ];
    }
    
    $build['help'] = [
      '#type' => 'markup',
      '#markup' => '<div class="dqm-help-text">' . 
                   ($is_preview ? 
                     'Preview content will be extracted without admin toolbars and menus.' : 
                     'Page content will be scanned for quality issues.') . 
                   '</div>',
    ];
    
    $build['#attached']['html_head'][] = [
      [
        '#tag' => 'style',
        '#value' => '
          .crownpeak-dqm-toolbar-tray { padding: 15px; min-width: 250px; }
          .dqm-preview-notice { background: #e3f2fd; padding: 10px; margin-bottom: 10px; border-radius: 4px; font-size: 12px; }
          .dqm-help-text { font-size: 11px; color: #666; margin-top: 10px; }
          .crownpeak-dqm-toolbar-tray button { margin: 5px 0; width: 100%; }
          .button--small { font-size: 12px; padding: 5px 10px; }
        ',
      ],
      'crownpeak-dqm-tray-style'
    ];
    
    return $build;
  }
}