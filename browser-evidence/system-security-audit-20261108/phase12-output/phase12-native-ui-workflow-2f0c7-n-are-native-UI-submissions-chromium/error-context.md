# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase12-native-ui-workflows.spec.js >> Phase 12.1 customer booking, approval, and cashier verification are native UI submissions
- Location: e2e\phase12-native-ui-workflows.spec.js:87:1

# Error details

```
Test timeout of 300000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - img [ref=e8]
        - generic [ref=e10]:
          - generic [ref=e11]: Pawesome
          - generic [ref=e12]: Customer Portal
      - navigation [ref=e13]:
        - list [ref=e14]:
          - listitem [ref=e15]:
            - link "Services" [ref=e16] [cursor=pointer]:
              - /url: /customer/services
              - img [ref=e18]
              - generic [ref=e20]: Services
          - listitem [ref=e21]:
            - link "My Pets" [ref=e22] [cursor=pointer]:
              - /url: /customer/pets
              - img [ref=e24]
              - generic [ref=e26]: My Pets
          - listitem [ref=e27]:
            - link "My Requests" [ref=e28] [cursor=pointer]:
              - /url: /customer/bookings
              - img [ref=e30]
              - generic [ref=e32]: My Requests
          - listitem [ref=e33]:
            - link "Notifications" [ref=e34] [cursor=pointer]:
              - /url: /customer/notifications
              - img [ref=e36]
              - generic [ref=e38]: Notifications
          - listitem [ref=e39]:
            - link "History" [ref=e40] [cursor=pointer]:
              - /url: /customer/history
              - img [ref=e42]
              - generic [ref=e44]: History
          - listitem [ref=e45]:
            - link "Medical" [ref=e46] [cursor=pointer]:
              - /url: /customer/medical-confinements
              - img [ref=e48]
              - generic [ref=e50]: Medical
          - listitem [ref=e51]:
            - link "Reports" [ref=e52] [cursor=pointer]:
              - /url: /customer/reports
              - img [ref=e54]
              - generic [ref=e56]: Reports
          - listitem [ref=e57]:
            - link "Profile" [ref=e58] [cursor=pointer]:
              - /url: /customer/profile
              - img [ref=e60]
              - generic [ref=e62]: Profile
      - button "Log Out" [ref=e64] [cursor=pointer]:
        - img [ref=e65]
        - generic [ref=e67]: Log Out
    - main [ref=e68]:
      - generic [ref=e69]:
        - generic [ref=e70]:
          - heading "Grooming Booking" [level=1] [ref=e71]
          - paragraph [ref=e72]: Schedule grooming sessions for your pet.
        - generic [ref=e73]:
          - button "Notifications" [ref=e75] [cursor=pointer]:
            - img [ref=e76]
            - generic [ref=e78]: 9+
          - button "CUSTOMER Customer" [ref=e80] [cursor=pointer]:
            - img [ref=e82]
            - generic [ref=e84]:
              - strong [ref=e85]: CUSTOMER
              - generic [ref=e86]: Customer
      - generic [ref=e89]:
        - link "Back to services" [ref=e90] [cursor=pointer]:
          - /url: /customer/services
          - img [ref=e91]
          - text: Back to services
        - heading "Pet Grooming" [level=1] [ref=e94]
        - generic [ref=e95]:
          - button "New Appointment" [ref=e96] [cursor=pointer]
          - button "My Appointments" [ref=e97] [cursor=pointer]
        - generic [ref=e98]:
          - heading "Grooming Appointment Form" [level=2] [ref=e99]
          - generic [ref=e100]:
            - textbox "Customer Name" [ref=e101]: CUSTOMER
            - combobox [ref=e102]:
              - option "Select active pet"
              - option "PHASE12 Pet 38713360 — Dog · UI Workflow (Not provided)" [selected]
              - option "PHASE11_TEST Pet 1794137406954 — Dog · Demo (Not provided)"
              - option "PHASE11_TEST Pet 1794136560517 — Dog · Demo (Not provided)"
              - option "Buddy — Dog · Golden Retriever (Not provided)"
            - region "PHASE12 Pet 38713360 pet details" [ref=e103]:
              - generic [ref=e104]:
                - strong [ref=e105]: PHASE12 Pet 38713360
                - generic [ref=e106]: Selected pet details
              - generic [ref=e107]:
                - generic [ref=e108]:
                  - generic [ref=e109]: Type
                  - strong [ref=e110]: Dog
                - generic [ref=e111]:
                  - generic [ref=e112]: Breed
                  - strong [ref=e113]: UI Workflow
                - generic [ref=e114]:
                  - generic [ref=e115]: Gender
                  - strong [ref=e116]: Female
                - generic [ref=e117]:
                  - generic [ref=e118]: Age
                  - strong [ref=e119]: Not provided
                - generic [ref=e120]:
                  - generic [ref=e121]: Birthdate
                  - strong [ref=e122]: Not provided
                - generic [ref=e123]:
                  - generic [ref=e124]: Care notes
                  - strong [ref=e125]: PHASE12_NATIVE_UI_38713360
            - combobox [ref=e126]:
              - option "Select a grooming service..."
              - option "Basic Bath and Blow Dry Medium Breed — ₱500.00" [selected]
              - option "Basic Bath and Blow Dry Small Breed — ₱350.00"
              - option "Ear Cleaning — ₱150.00"
              - option "Full Grooming Medium Breed — ₱950.00"
              - option "Full Grooming Small Breed — ₱700.00"
              - option "Fur Trimming — ₱300.00"
              - option "Medicated Bath — ₱650.00"
              - option "Nail Trimming — ₱150.00"
              - option "Tick and Flea Bath — ₱600.00"
            - generic [ref=e127]:
              - textbox "mm/dd/yyyy" [ref=e129] [cursor=pointer]
              - generic [ref=e130]: "Closed on public holidays: Bonifacio Day (Nov 30), Feast of the Immaculate Conception (Dec 8), Christmas Eve (Dec 24)"
            - generic [ref=e131]: Appointment Time *
            - combobox "Appointment Time *" [disabled] [ref=e132]:
              - option "Select an available time" [selected]
            - textbox "Notes or special instructions" [ref=e133]
            - generic [ref=e134]:
              - strong [ref=e135]: "Estimated Price:"
              - text: ₱500.00
            - button "Submit Request" [ref=e136] [cursor=pointer]
    - button "Pawesome Assistant Assistant" [ref=e138] [cursor=pointer]:
      - img "Pawesome Assistant" [ref=e140]
      - generic [ref=e141]: Assistant
  - button "Open booking tracker" [ref=e143] [cursor=pointer]:
    - img [ref=e145]
    - generic [ref=e147]: 16 bookings
    - generic "Booking status updated" [ref=e148]
```