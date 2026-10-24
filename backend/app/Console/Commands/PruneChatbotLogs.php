<?php

namespace App\Console\Commands;

use App\Models\ChatbotLog;
use Illuminate\Console\Command;

/**
 * Deletes chatbot_logs rows older than chatbot.log_retention_days
 * (default 90). Scheduled daily — transcripts are support data, not
 * permanent records.
 */
class PruneChatbotLogs extends Command
{
    protected $signature = 'chatbot:prune-logs {--days= : Override retention window}';

    protected $description = 'Delete chatbot log rows older than the configured retention window';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?: config('chatbot.log_retention_days', 90));
        if ($days < 1) {
            $this->error('Retention window must be at least 1 day.');
            return 1;
        }

        $cutoff = now()->subDays($days);
        $deleted = ChatbotLog::where('created_at', '<', $cutoff)->delete();

        $this->info("Pruned {$deleted} chatbot log row(s) older than {$days} days.");

        return 0;
    }
}
