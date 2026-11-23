# Respondent Count Reconciliation

## Status

**BLOCKED.** The original, row-level survey response dataset and response disposition log were not found. Neither 43 nor 48 can be accepted as the verified count. No category or exclusion was inferred.

## Reconciliation table

| Data item | Existing manuscript value | Verified source value | Evidence | Required correction |
|---|---|---|---|---|
| Total respondents in abstract/front matter | 43 | Not established | `PAPER_updated-2.pdf`, abstract, front matter (text extraction around abstract); no raw response file located. | Obtain anonymized respondent-level records and response/exclusion log; then correct every instance. |
| Abstract category counts | 30 customers, 3 admin/staff, 10 IT professionals | Not established | Same abstract passage. Counts sum to 43, but that arithmetic does not prove valid responses. | Reconcile category for each valid response with source records and approved participant criteria. |
| Table 4 total | 48 | Not established | `PAPER_updated-2.pdf`, Chapter III, Table 4, printed p. 91. | Rebuild the frequency table from validated records; do not prefer this count because it appears elsewhere. |
| Table 4 category counts | 30 customers, 8 owner/staff, 10 IT professionals | Not established | Table 4, printed p. 91. The categories sum to 48. | Establish whether the 8 owner/staff records are valid, distinct, complete evaluation forms. |
| Table 4 percentages | 62.50%, 16.67%, 20.83%, total 100% | Arithmetic only: these percentages are consistent with 30/48, 8/48, 10/48 | Direct calculation from printed frequencies. | Recompute from verified final denominator; do not treat arithmetic consistency as validation of the underlying counts. |
| Chapter IV participants | 48: 30 customers, 8 admin/staff, 10 IT professionals | Not established | `PAPER_updated-2.pdf`, Results and Discussion, printed p. 106. | Reconcile with raw records and use consistent category labels. |
| Summary/conclusion respondent count | 43; group totals/means are also stated | Not established | `PAPER_updated-2.pdf`, abstract and Chapter V summary/conclusion, including printed p. 115. | Update only after validated records and calculations are approved. |
| Duplicates, incomplete, invalid, or excluded records | Not reported in the inspected text | Not established | No response-level records, exclusion log, or cleaned dataset found in the repository or targeted Downloads folder. | Provide a de-identified disposition table with inclusion/exclusion rule and counts. |
| Sampling frame/population | No usable N or respondent roster was found in extracted methodology | Not established | Manuscript says purposive sampling; no population frame or respondent selection log located. | Supply the actual recruitment/selection process and the population information, if any. |

## Source search and limits

- The Downloads root contains `PAPER_updated-2.pdf` and the official `CAP-B.docx`, but no Pawesome manuscript DOCX, response spreadsheet, CSV survey data, SPSS file, or calculation workbook.
- The repository contains no survey/response-specific data file. The discovered CSV files are product inventory lists, not evaluation records.
- The PDF includes the questionnaire and an accomplished IT-professional evaluation instrument as appendix images, plus participant photo documentation. These are not a complete, auditable set of all respondent answers and do not establish all valid/invalid responses.
- `docs/EVALUATION_EVIDENCE.md` indexes system-verification evidence; it does not contain the ISO questionnaire raw responses or calculation workbook.
- `docs/methodology_actual*.docx` and `docs/increment_*.docx` are partial method/prose artifacts with placeholders, not an editable thesis or respondent dataset.

## Evidence required to unblock

Provide a privacy-safe, de-identified export with one row per submitted evaluation and:

1. Stable anonymous respondent ID and respondent category.
2. Per-question responses and the approved response scale/codebook.
3. Completeness and validity rules, including duplicate handling.
4. A disposition list for all received forms: included, incomplete, duplicate, invalid, or excluded, with non-identifying reason.
5. Actual selection/recruitment procedure and confirmation from the researchers/adviser of how participants were chosen.
6. Any sampling frame, target population size, or sample-size plan actually used.
7. The original workbook/calculation sheet that produced Table 3-14, summary values, and conclusions.

Until those records are supplied, **retain both existing figures as contradictory manuscript values and do not choose either**.
