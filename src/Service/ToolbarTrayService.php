<?php

namespace Drupal\dqm_drupal_module\Service;

use Drupal\Core\StringTranslation\TranslationInterface;
use Symfony\Component\HttpFoundation\RequestStack;

class ToolbarTrayService {

  protected $requestStack;
  protected $stringTranslation;

  public function __construct(RequestStack $request_stack, TranslationInterface $string_translation) {
    $this->requestStack = $request_stack;
    $this->stringTranslation = $string_translation;
  }

  protected function t($string, array $args = [], array $options = []) {
    return $this->stringTranslation->translate($string, $args, $options);
  }

  public function isPreviewMode(): bool {
    $current_path = $this->requestStack->getCurrentRequest()->getPathInfo();
    return (strpos($current_path, '/node/preview/') !== FALSE || strpos($current_path, '/preview/') !== FALSE);
  }

  public function buildTrayContent(): array {
    $is_preview = $this->isPreviewMode();

    $build = [
      '#type' => 'container',
      '#attributes' => ['class' => ['dqm-drupal-module-toolbar-tray']],
    ];

    if ($is_preview) {
      $build['preview_notice'] = $this->buildPreviewNotice();
      $build['run_quality_check'] = $this->buildPreviewScanButton();
      $build['scan_url'] = $this->buildServerSideScanButton();
    }
    else {
      $build['run_quality_check'] = $this->buildQualityCheckButton();
    }

    $build['help'] = $this->buildHelpText($is_preview);
    $build['#attached'] = $this->attachStyles();

    return $build;
  }

  protected function buildPreviewNotice(): array {
    return [
      '#type' => 'markup',
      '#markup' => '<div class="dqm-preview-notice"><strong>Preview Mode Detected</strong><br>Enhanced content extraction for preview content.</div>',
    ];
  }

  protected function buildPreviewScanButton(): array {
    return [
      '#type' => 'button',
      '#value' => $this->t('Scan Preview Content'),
      '#attributes' => [
        'class' => ['dqm-drupal-module-run-quality-check', 'button--primary'],
        'title' => $this->t('Extract and scan the preview content without admin elements'),
      ],
    ];
  }

  protected function buildServerSideScanButton(): array {
    return [
      '#type' => 'button',
      '#value' => $this->t('Server-Side Scan'),
      '#attributes' => [
        'class' => ['dqm-drupal-module-scan-url', 'button--small'],
        'title' => $this->t('Render content on server and scan (recommended for preview pages)'),
      ],
    ];
  }

  protected function buildQualityCheckButton(): array {
    return [
      '#type' => 'button',
      '#value' => $this->t('Run Quality Check'),
      '#attributes' => [
        'class' => ['dqm-drupal-module-run-quality-check'],
      ],
    ];
  }

  protected function buildHelpText(bool $is_preview): array {
    $help_message = $is_preview
      ? 'Preview content will be extracted without admin toolbars and menus.'
      : 'Page content will be scanned for quality issues.';

    return [
      '#type' => 'markup',
      '#markup' => '<div class="dqm-help-text">' . $help_message . '</div>',
    ];
  }

  protected function attachStyles(): array {
    return [
      'html_head' => [
        [
          [
            '#tag' => 'style',
            '#value' => '
              .dqm-drupal-module-toolbar-tray { padding: 15px; min-width: 250px; }
              .dqm-preview-notice { background: #e3f2fd; padding: 10px; margin-bottom: 10px; border-radius: 4px; font-size: 12px; }
              .dqm-help-text { font-size: 11px; color: #666; margin-top: 10px; }
              .dqm-drupal-module-toolbar-tray button { margin: 5px 0; width: 100%; }
              .button--small { font-size: 12px; padding: 5px 10px; }
            ',
          ],
          'dqm-drupal-module-tray-style',
        ],
      ],
    ];
  }

}
