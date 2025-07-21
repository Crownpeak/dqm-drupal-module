<?php

namespace Drupal\dqm_drupal_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\dqm_drupal_module\Service\ToolbarTrayService;
use Symfony\Component\DependencyInjection\ContainerInterface;

class ToolbarTrayController extends ControllerBase {

  protected $toolbarTrayService;

  public function __construct(ToolbarTrayService $toolbar_tray_service) {
    $this->toolbarTrayService = $toolbar_tray_service;
  }

  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('dqm_drupal_module.toolbar_tray_service')
    );
  }

  public function tray() {
    return $this->toolbarTrayService->buildTrayContent();
  }

}