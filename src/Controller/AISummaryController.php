<?php

namespace Drupal\dqm_drupal_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\Core\Config\ConfigFactoryInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\RequestException;

class AISummaryController extends ControllerBase {
  protected $httpClient;
  protected $configFactory;


  public function __construct(ClientInterface $http_client, ConfigFactoryInterface $config_factory) {
    $this->httpClient = $http_client;
    $this->configFactory = $config_factory;
  }

  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('http_client'),
      $container->get('config.factory')
    );
  }

  public function generateSummary(Request $request) {
    $config = $this->configFactory->get('dqm_drupal_module.settings');
    $openai_api_key = $config->get('openai_api_key');
    $openai_model = $config->get('openai_model') ?: 'gpt-4o-mini';
    $openai_base_url = $config->get('openai_base_url') ?: 'https://api.openai.com/v1';

    $asset_id = $request->request->get('assetId');
    $checkpoints_json = $request->request->get('checkpoints');
    $target_lang = $request->request->get('targetLang') ?: 'en';

    if (empty($openai_api_key) || strlen($openai_api_key) < 10) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'OpenAI API key is missing or invalid.',
      ]);
    }

    if (empty($asset_id)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'No valid assetId provided.',
      ]);
    }

    if (empty($checkpoints_json)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'No checkpoints data provided.',
      ]);
    }

    $checkpoints = json_decode($checkpoints_json, TRUE);
    if (!is_array($checkpoints)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'Invalid checkpoints data format.',
      ]);
    }

    $failed_checkpoints = array_filter($checkpoints, function ($cp) {
      return isset($cp['failed']) && $cp['failed'] === TRUE;
    });

    if (empty($failed_checkpoints)) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'No failed checkpoints to summarize.',
      ]);
    }

    $checkpoint_details = [];
    foreach ($failed_checkpoints as $cp) {
      $checkpoint_details[] = sprintf(
        "- %s: %s",
        $cp['name'] ?? 'Unknown',
        $cp['description'] ?? 'No description'
      );
    }

    $total_failed = count($failed_checkpoints);

    $language_names = [
      'en' => 'English',
      'de' => 'German (Deutsch)',
      'es' => 'Spanish (Español)',
    ];

    $language_name = $language_names[$target_lang] ?? $language_names['en'];

    $language_specific_instruction = '';
    if ($target_lang === 'de') {
      $language_specific_instruction = ' Schreiben Sie auf Deutsch; vermeiden Sie Anglizismen, wenn möglich.';
    }
    elseif ($target_lang === 'es') {
      $language_specific_instruction = ' Escribe en español; evita anglicismos cuando sea posible.';
    }

    $system_prompt = sprintf(
      'You are an assistant that summarizes a website quality/accessibility report for developers. Write in %s (%s).%s Return 5–7 concise bullet points with the most important findings and next actions. Each bullet must be <= 140 characters. No prefixes like "Next step:" / "Nächster Schritt:". Base the summary on the checkpoint texts (name/description). Prefer actionable wording and group similar issues. Do not hallucinate; only use the provided data. Return JSON only.',
      $language_name,
      $target_lang,
      $language_specific_instruction
    );

    $payload = [
      'failedCheckpoints' => array_map(function ($cp) {
        return [
          'id' => $cp['id'] ?? '',
          'name' => $cp['name'] ?? '',
          'description' => $cp['description'] ?? '',
        ];
      }, array_values($failed_checkpoints)),
      'siteName' => 'Drupal Site',
      'failedCount' => $total_failed,
    ];

    $schema = json_encode([
      'type' => 'object',
      'properties' => [
        'bullets' => [
          'type' => 'array',
          'items' => ['type' => 'string'],
        ],
      ],
      'required' => ['bullets'],
      'additionalProperties' => FALSE,
    ]);

    $user_prompt = sprintf(
      "Payload: %s\n\nSchema (JSON): %s",
      json_encode($payload),
      $schema
    );

    $endpoint = rtrim($openai_base_url, '/') . '/chat/completions';

    $body_data = [
      'model' => $openai_model,
      'messages' => [
        ['role' => 'system', 'content' => $system_prompt],
        ['role' => 'user', 'content' => $user_prompt],
      ],
      'response_format' => ['type' => 'json_object'],
      'max_completion_tokens' => $target_lang === 'en' ? 384 : 512,
    ];

    $is_reasoning_model = strpos($openai_model, 'o1-') === 0 || strpos($openai_model, 'o3-') === 0 || strpos($openai_model, 'gpt-5') === 0;
    if (!$is_reasoning_model) {
      $body_data['temperature'] = 0.3;
    }

    try {
      $response = $this->httpClient->post($endpoint, [
        'headers' => [
          'Content-Type' => 'application/json',
          'Authorization' => 'Bearer ' . $openai_api_key,
        ],
        'body' => json_encode($body_data),
        'timeout' => 60,
      ]);

      $status_code = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);

      if ($status_code !== 200) {
        $error_message = $data['error']['message'] ?? 'Unknown error';
        return new JsonResponse([
          'success' => FALSE,
          'message' => 'OpenAI API error: ' . $error_message,
        ]);
      }

      if (!isset($data['choices'][0]['message']['content'])) {
        return new JsonResponse([
          'success' => FALSE,
          'message' => 'Invalid response from OpenAI API.',
        ]);
      }

      $summary = trim($data['choices'][0]['message']['content']);

      $json_data = json_decode($summary, TRUE);
      if (json_last_error() === JSON_ERROR_NONE && isset($json_data['bullets']) && is_array($json_data['bullets'])) {
        $bullets = array_map('trim', $json_data['bullets']);
        $bullets = array_filter($bullets, function ($b) {
          return !empty($b);
        });
        $bullets = array_values($bullets);
      }
      else {
        $bullets = [];
        $lines = explode("\n", $summary);
        foreach ($lines as $line) {
          $line = trim($line);
          if (empty($line)) {
            continue;
          }
          $line = preg_replace('/^[-*•]\s*/', '', $line);
          $line = preg_replace('/^\d+\.\s*/', '', $line);
          if (!empty($line)) {
            $bullets[] = $line;
          }
        }
      }

      $stats = [
        'totalCheckpoints' => count($checkpoints),
        'failedCheckpoints' => $total_failed,
        'model' => $openai_model,
      ];

      return new JsonResponse([
        'success' => TRUE,
        'bullets' => $bullets,
        'stats' => $stats,
        'cached' => FALSE,
      ]);

    }
    catch (RequestException $e) {
      return new JsonResponse([
        'success' => FALSE,
        'message' => 'OpenAI API request failed: ' . $e->getMessage(),
      ]);
    }
  }

}
