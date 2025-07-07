<?php
namespace Drupal\crownpeak_dqm\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\DependencyInjection\ContainerInterface;

class ToolbarTrayController extends ControllerBase {
  /**
   * Returns the tray content for the Crownpeak DQM toolbar tab.
   */
  public function tray() {
    return [
      '#type' => 'container',
      '#attributes' => ['class' => ['crownpeak-dqm-toolbar-tray']],
      'run_quality_check' => [
        '#type' => 'button',
        '#value' => $this->t('Run Quality Check'),
        '#attributes' => [
          'class' => ['crownpeak-dqm-run-quality-check'],
        ],
      ],
    ];
  }
} 