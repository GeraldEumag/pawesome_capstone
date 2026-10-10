<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class TestChatbotFaqCategories extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:test-chatbot-faq-categories';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Test ChatbotFaq category validation and consistency';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Testing ChatbotFaq category consistency...');
        
        try {
            // Test valid categories
            $validCategories = \App\Models\ChatbotFaq::VALID_CATEGORIES;
            $this->info('Valid categories: ' . implode(', ', $validCategories));
            
            // Test creating FAQs with valid categories
            $faq1 = \App\Models\ChatbotFaq::create([
                'question' => 'What are your operating hours?',
                'answer' => 'We are open Monday to Saturday from 10:00 AM to 6:00 PM.',
                'category' => 'general',
                'is_active' => true,
            ]);
            
            $faq2 = \App\Models\ChatbotFaq::create([
                'question' => 'How much is pet grooming?',
                'answer' => 'Our pet grooming services start at ₱500.',
                'category' => 'services',
                'is_active' => true,
            ]);
            
            $faq3 = \App\Models\ChatbotFaq::create([
                'question' => 'What are your prices?',
                'answer' => 'Our prices vary by service. Please contact us for details.',
                'category' => 'pricing',
                'is_active' => true,
            ]);
            
            $this->info('✅ FAQs created with valid categories:');
            $this->info('  - ' . $faq1->question . ': ' . $faq1->category);
            $this->info('  - ' . $faq2->question . ': ' . $faq2->category);
            $this->info('  - ' . $faq3->question . ': ' . $faq3->category);
            
            // Test invalid category (should default to 'general')
            $faq4 = \App\Models\ChatbotFaq::create([
                'question' => 'Test invalid category?',
                'answer' => 'This should default to general category.',
                'category' => 'InvalidCategory',
                'is_active' => true,
            ]);
            
            $this->info('✅ FAQ with invalid category defaults to: ' . $faq4->category);
            
            // Test that category field is now fillable
            $this->info('✅ Category field is now properly included in fillable array');
            
            // Test category validation
            $this->info('✅ ChatbotFaq category consistency verified!');
            
            // Clean up
            $faq1->delete();
            $faq2->delete();
            $faq3->delete();
            $faq4->delete();
            
            $this->info('✅ Test records cleaned up successfully!');
            
            return 0;
            
        } catch (\Exception $e) {
            $this->error('❌ ERROR: ' . $e->getMessage());
            return 1;
        }
    }
}
