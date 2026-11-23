# Statistical Validation

## Status

**BLOCKED for response-based recalculation.** No raw survey responses or original statistics workbook were located. This report validates only visible arithmetic and documents the missing inputs; it does not validate the study's results.

## Calculation verification

| Measure | Formula / inputs | Calculation possible from available evidence | Result | Dataset reference / manuscript locations | Status |
|---|---|---|---|---|---|
| Table 4 category total | 30 customers + 8 owner/staff + 10 IT professionals | 30 + 8 + 10 | 48 | `PAPER_updated-2.pdf`, Table 4, p. 91; results, p. 106 | Arithmetic verified; factual count UNVERIFIED. |
| Table 4 percentages | `percentage = frequency / N * 100`, N=48 as printed | 30/48=62.50%; 8/48=16.666...%; 10/48=20.833...% | 62.50%, 16.67%, 20.83%; sum 100.00% after rounding | Table 4, p. 91 | Arithmetic verified only, conditional on N=48. |
| Abstract category total | 30 customers + 3 admin/staff + 10 IT professionals | 30 + 3 + 10 | 43 | Abstract/front matter | Arithmetic verified; factual count UNVERIFIED. |
| Group/overall weighted means | For a 1-5 Likert scale: `WM = sum(f_i * w_i) / sum(f_i)`; all item response frequencies and weights are required | Not possible without response-level item frequencies and group denominators | No independently recalculated mean | Tables 3-14, abstract, results, summary/conclusion | BLOCKED. |
| Percentages outside Table 4 | `f / validated N * 100` | Not possible without validated frequencies and N | Not recalculated | Results tables and participant descriptions | BLOCKED. |
| Slovin sample size | Common form: `n = N / (1 + N e^2)`; requires a defined population N and a sampling design for which the formula is justified | No usable N, margin rationale, or probability-sampling frame was found. The methodology states purposive sampling. | Do not calculate or claim a Slovin-derived sample size. | Statistical Treatment of Data, pp. 91-93 | BLOCKED pending population/design and adviser decision. |
| Rating interpretation | Printed intervals: 4.50-5.00 Excellent; 3.50-4.49 Very Good; 2.50-3.49 Good; 1.50-2.49 Fair; 1.00-1.49 Poor | Boundary labels are transcribed from the PDF; underlying instrument/approved interpretation was not supplied separately. | Do not change categories without approved instrument/adviser confirmation. | Table 3, p. 91 | Partly transcribed; source validity UNVERIFIED. |

## Reported values not independently validated

The abstract reports overall weighted mean 4.69, Functional Suitability 4.78, Compatibility 4.59, and respondent-group values of 4.80, 4.74, and 4.57. Chapter IV contains characteristic/item tables, some with visibly incomplete or displaced values in text extraction. Chapter V repeats selected ratings. These are manuscript claims only; no value is confirmed against original responses.

## Methodological cautions

- The current PDF describes purposive sampling in the participant/data-analysis text. A purposive sample is not automatically a simple random sample; Slovin's formula must not be retained merely because it appears in a draft.
- The prior `docs/audit/PHASE6_MANUSCRIPT_ALIGNMENT.md` describes a purposive-versus-random inconsistency in an earlier manuscript state. The current PDF text search did not locate "random sampling"; actual selection remains an author-confirmation item, not a license to silently edit methodology.
- "Weighted mean" must state what the frequency represents (respondents per response option), the exact scale weights, missing-response handling, and whether group means weight each respondent or pool all item responses.
- No preferred mean, denominator, exclusions, or rounding rule was reverse-engineered.

## Required recalculation package

Supply the anonymized response data, item codebook, approved questionnaire/scoring guide, respondent disposition and category file, the original workbook, and a researcher/adviser confirmation of the sampling method. Then calculate all item, group, characteristic, and overall results from one documented script or workbook; apply one rounding rule; compare the outputs with every table/narrative in the abstract, Chapter III, Chapter IV, and Chapter V.
