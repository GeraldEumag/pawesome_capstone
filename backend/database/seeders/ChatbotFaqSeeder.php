<?php

namespace Database\Seeders;

use App\Models\ChatbotFaq;
use Illuminate\Database\Seeder;

class ChatbotFaqSeeder extends Seeder
{
    /**
     * Run the database seeds with predefined FAQ entries for the chatbot.
     */
    public function run(): void
    {
        $faqs = [
            // General FAQs — store facts must match config/store.php
            [
                'question' => 'What are your business hours?',
                'answer' => 'We are open every day from 10:00 AM to 6:00 PM, including weekends and holidays unless otherwise announced.',
                'keywords' => ['hours', 'open', 'time', 'schedule', 'when'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 1,
            ],
            [
                'question' => 'What is your contact information?',
                'answer' => 'You can reach Pawesome Retreat Inc. at:\n📞 Phone: 270020371\n📧 Email: pawesomeretreat24@gmail.com\n🏢 Address: San Isidro Village, Aldana, Pamplona Uno, Las Piñas, 1740 Metro Manila\n📘 Facebook: facebook.com/PawesomeRetreat\n📸 Instagram: @pawesomeretreat',
                'keywords' => ['contact', 'phone', 'email', 'address', 'reach'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'question' => 'Where are you located?',
                'answer' => 'We are located at San Isidro Village, Aldana, Pamplona Uno, Las Piñas, 1740 Metro Manila. We are open daily from 10:00 AM to 6:00 PM.',
                'keywords' => ['where', 'location', 'address', 'directions', 'located', 'map'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 2,
            ],
            [
                'question' => 'Do you offer emergency services?',
                'answer' => 'For urgent concerns during operating hours (10:00 AM–6:00 PM daily), please call us at 270020371 or come to the clinic. Outside operating hours, please proceed to the nearest 24-hour emergency veterinary facility.',
                'keywords' => ['emergency', 'urgent', '24/7', 'after hours', 'critical'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 3,
            ],
            [
                'question' => 'What payment methods do you accept?',
                'answer' => 'We accept:\n📱 GCash — send to our GCash number and upload the receipt screenshot; our system reads the reference automatically\n📱 Maya — same flow as GCash\n💵 Cash — at the counter for walk-in bookings\n\nOnline payments are verified by our cashier before confirmation.',
                'keywords' => ['payment', 'pay', 'cash', 'card', 'gcash', 'maya'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 4,
            ],

            // Pet Hotel FAQs
            [
                'question' => 'How much does pet boarding cost?',
                'answer' => 'Our pet hotel rates per night:\n\n🐕 Standard Kennel: ₱500\n🐕 Large Kennel: ₱800\n🐱 Cattery Suite: ₱450\n🐱 Deluxe Cattery: ₱700\n🏠 Standard Room: ₱600\n� Deluxe Suite: ₱1,200\n\nRates are shown on the booking page when you choose your dates and room.',
                'keywords' => ['price', 'cost', 'rate', 'boarding', 'hotel', 'stay', 'how much'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 10,
            ],
            [
                'question' => 'What do I need to bring for pet boarding?',
                'answer' => 'Please bring:\n✅ Vaccination records — required; upload the card when booking and reception must verify it before approval\n✅ Your pet\'s regular food\n✅ Any required medications with instructions\n✅ A familiar toy or blanket (optional)\n\nWe provide bedding and bowls. Please do not bring expensive items.',
                'keywords' => ['bring', 'what to bring', 'requirements', 'vaccination', 'documents'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 11,
            ],
            [
                'question' => 'Can I check on my pet during their stay?',
                'answer' => 'Absolutely! You can:\n Request photos of your pet\n📞 Call us during business hours at 270020371\n💬 Ask me here anytime — I can check your boarding status live',
                'keywords' => ['check', 'update', 'photo', 'status', 'how is my pet'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 12,
            ],
            [
                'question' => 'What is your cancellation policy for boarding?',
                'answer' => 'You may cancel free of charge up to 24 hours before your check-in date or appointment time. For cancellations inside 24 hours, please contact reception at 270020371.',
                'keywords' => ['cancel', 'cancellation', 'refund', 'policy', 'reschedule'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 13,
            ],
            [
                'question' => 'What are the check-in and check-out times for boarding?',
                'answer' => 'Boarding check-in and check-out can be done any time during operating hours — 10:00 AM to 6:00 PM daily.',
                'keywords' => ['check-in', 'check-out', 'checkin', 'checkout', 'pickup', 'drop-off', 'dropoff'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 14,
            ],
            [
                'question' => 'Do I need a vaccination card for boarding?',
                'answer' => 'Yes. A vaccination card must be uploaded when you book a boarding stay, and reception must verify it before the booking can be approved. Please make sure your pet\'s vaccinations are up-to-date.',
                'keywords' => ['vaccination', 'vaccine', 'card', 'requirement', 'required'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 15,
            ],

            // Service FAQs
            [
                'question' => 'What services do you offer?',
                'answer' => 'We offer:\n\n🏨 Pet Hotel & Boarding\n🐕 Dog Grooming (bath, haircut, nail trim)\n🐱 Cat Grooming\n💉 Veterinary Services\n🛍️ Pet Supplies\n\nBook any service through your Pawesome account or ask me to help!',
                'keywords' => ['services', 'what do you do', 'offerings', 'available'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 20,
            ],
            [
                'question' => 'Do I need to book an appointment?',
                'answer' => 'Yes, appointments are required for:\n✂️ Grooming services\n🩺 Veterinary consultations\n\nPet hotel/boarding reservations should be made in advance when possible.\n\nYou can book through:\n🌐 Your Pawesome account (or ask me to start a booking)\n📞 Phone call during business hours at 270020371',
                'keywords' => ['appointment', 'book', 'schedule', 'reservation', 'how to book'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 21,
            ],
            [
                'question' => 'How long does grooming take?',
                'answer' => 'Typical grooming times:\n\n🐕 Small dogs: 1-2 hours\n🐕 Medium dogs: 2-3 hours\n🐕 Large dogs: 3-4 hours\n🐱 Cats: 1.5-2 hours\n\nWe\'ll update you when your pet is ready for pickup — you can also ask me here for a status check.',
                'keywords' => ['grooming time', 'how long', 'duration', 'groom'],
                'scope' => 'general',
                'is_active' => true,
                'sort_order' => 22,
            ],

            // Customer-specific FAQs
            [
                'question' => 'How do I book a hotel stay?',
                'answer' => 'To book a pet hotel stay:\n\n1. Go to the Pet Hotel page on your dashboard\n2. Select your dates and preferred room type\n3. Choose your pet\n4. Upload your pet\'s vaccination card\n5. Complete the booking form\n6. Wait for confirmation\n\nOr simply ask me to help you navigate there!',
                'keywords' => ['book hotel', 'book boarding', 'reserve room', 'how to book'],
                'scope' => 'customer',
                'is_active' => true,
                'sort_order' => 30,
            ],
            [
                'question' => 'How do I get booking updates and notifications?',
                'answer' => 'You get updates automatically:\n\n🔔 In-app notifications on your dashboard when a booking is approved, scheduled, or updated\n📧 Email receipts after the cashier verifies your payment\n💬 You can also ask me here for a live status check anytime',
                'keywords' => ['notifications', 'updates', 'notify', 'alert', 'reminder'],
                'scope' => 'customer',
                'is_active' => true,
                'sort_order' => 31,
            ],
            [
                'question' => 'How do I view my upcoming appointments?',
                'answer' => 'You can view your appointments:\n\n🌐 On the Customer Dashboard under "My Appointments"\n🤖 By asking me "What are my appointments?" or "status ng request ko"\n\nYou\'ll see all scheduled, confirmed, and past appointments with details.',
                'keywords' => ['appointments', 'view', 'upcoming', 'my bookings', 'schedule'],
                'scope' => 'customer',
                'is_active' => true,
                'sort_order' => 32,
            ],

            // Staff-specific FAQs
            [
                'question' => 'How do I check in a boarding guest?',
                'answer' => 'To check in a boarding guest:\n\n1. Go to Receptionist → Hotel Bookings\n2. Find the reservation\n3. Click "Check In"\n4. Verify vaccination records\n5. Collect any special instructions\n6. Assign room if not pre-assigned\n7. Confirm check-in\n\nThe customer will receive a notification automatically.',
                'keywords' => ['check in', 'checkin', 'boarding checkin', 'how to check in'],
                'scope' => 'receptionist',
                'is_active' => true,
                'sort_order' => 40,
            ],
            [
                'question' => 'How do I approve an appointment?',
                'answer' => 'To approve a pending appointment:\n\n1. Go to Receptionist → Appointments\n2. Find the pending appointment\n3. Review the details\n4. Assign a veterinarian if needed\n5. Click "Approve"\n6. Confirm the action\n\nThe customer will receive an automatic confirmation notification.',
                'keywords' => ['approve', 'approval', 'confirm appointment', 'pending'],
                'scope' => 'receptionist',
                'is_active' => true,
                'sort_order' => 41,
            ],

            // Admin/Manager FAQs
            [
                'question' => 'How do I add a new staff member?',
                'answer' => 'To add a new staff member:\n\n1. Go to Admin → Users\n2. Click "Add User"\n3. Fill in the user details\n4. Select the appropriate role (receptionist, veterinary, etc.)\n5. Set a temporary password\n6. Save the user\n\nThe staff member will receive an email to set their password.',
                'keywords' => ['add user', 'new staff', 'create user', 'employee'],
                'scope' => 'admin',
                'is_active' => true,
                'sort_order' => 50,
            ],
            [
                'question' => 'How do I manage chatbot FAQs?',
                'answer' => 'To manage chatbot FAQs:\n\n1. Go to Admin → Chatbot Logs\n2. Click the "FAQs" tab\n3. Add, edit, or delete FAQ entries\n4. Set scope (general, customer, receptionist, etc.) to control visibility\n5. Add keywords for better matching\n6. Set sort order for priority\n\nChanges take effect immediately!',
                'keywords' => ['faq', 'chatbot faq', 'manage faq', 'edit faq'],
                'scope' => 'admin',
                'is_active' => true,
                'sort_order' => 51,
            ],
        ];

        foreach ($faqs as $faq) {
            // Answers are single-quoted PHP strings, so '\n' stays literal —
            // convert to real newlines before writing.
            $faq['answer'] = str_replace('\\n', "\n", $faq['answer']);
            ChatbotFaq::updateOrCreate(
                ['question' => $faq['question']],
                $faq
            );
        }
    }
}
