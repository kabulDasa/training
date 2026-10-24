# Streetlifting Program — Behavioural Spec (Gherkin)
#
# Reference data (pull-up belt kg / reps per WEEKS array):
#   W1:7.5×2  W2:7.5×3  W3:8.75×2  W4:8.75×3  W5:10×2  W6:10×3
#   W7:7.5×3(deload)  W8:11.25×2  W9:11.25×3  W10:12.5×2  W11:12.5×3  W12:13.75×2
#
# Reference data (squat kg per WEEKS array):
#   W1:80  W2:82.5  W3:85  W4:87.5  W5:90 … W12:102.5

# ─────────────────────────────────────────────────────────────────────────────
Feature: Double Progression Scheme
# Pull-up and dip alternate: rep-week (same weight, +1 rep) then weight-week
# (+1.25 kg, reps reset to base). Tricep ext / lat raise follow the same
# pattern with +2 reps / +2.5 kg steps.
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: Pull-up follows alternating rep-then-weight pattern
    Given the 12-week program is loaded
    Then week 1 pull-up target is "+7.5 kg × 2"
    And  week 2 pull-up target is "+7.5 kg × 3"
    And  week 3 pull-up target is "+8.75 kg × 2"
    And  week 4 pull-up target is "+8.75 kg × 3"
    And  week 5 pull-up target is "+10 kg × 2"

  Scenario: Dip follows the same alternating pattern as pull-up
    Given the 12-week program is loaded
    Then week 1 dip target is "+7.5 kg × 2"
    And  week 2 dip target is "+7.5 kg × 3"
    And  week 3 dip target is "+8.75 kg × 2"

  Scenario: Tricep extension uses +2 rep / +2.5 kg alternation
    Given the 12-week program is loaded
    Then week 1 tricep ext target is "10 kg × 10"
    And  week 2 tricep ext target is "10 kg × 12"
    And  week 3 tricep ext target is "12.5 kg × 10"

  Scenario: Lateral raise uses +2 rep / +1 kg alternation
    Given the 12-week program is loaded
    Then week 1 lateral raise target is "4 kg × 12"
    And  week 2 lateral raise target is "4 kg × 14"
    And  week 3 lateral raise target is "5 kg × 12"

  Scenario: Squat uses simple linear progression (+2.5 kg/week, no rep alternation)
    Given the 12-week program is loaded
    Then week 1 squat target is "80 kg"
    And  week 2 squat target is "82.5 kg"
    And  week 3 squat target is "85 kg"

  Scenario: Week 7 is a deload with reduced loads across all lifts
    Given the 12-week program is loaded
    Then week 7 is labelled as "DELOAD"
    And  week 7 pull-up target is "+8 kg × 3"
    And  week 7 squat target is "75 kg"


# ─────────────────────────────────────────────────────────────────────────────
Feature: Fixed-Rep Exercises
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: RDL reps are fixed at 6 every week
    Given the 12-week program is loaded
    Then every non-deload week shows RDL scheme "3 × 6"
    And  the deload week shows RDL scheme "2 × 6"

  Scenario: Tuck front lever seconds progress +1/week from a 5 s minimum
    Given the 12-week program is loaded
    Then week 1 tuck front lever scheme is "2 × 5 s" or "3 × 5 s"
    And  week 2 tuck front lever hold is 1 second longer than week 1
    And  week 3 tuck front lever hold is 1 second longer than week 2

  Scenario: Hanging knee raises progress +1 rep/week from a 12-rep minimum
    Given the 12-week program is loaded
    Then week 1 knee raise scheme contains "12"
    And  week 2 knee raise scheme contains "13"
    And  week 3 knee raise scheme contains "14"

  Scenario: Chin-ups progress +1 rep/week from a 5-rep minimum
    Given the 12-week program is loaded
    Then week 1 chin-up scheme contains "5"
    And  week 2 chin-up scheme contains "6"
    And  week 3 chin-up scheme contains "7"


# ─────────────────────────────────────────────────────────────────────────────
Feature: Warm-up Sets
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: Pull-up warm-up starts at BW then steps up in ≤4 kg increments
    Given week 3 pull-up working weight is "+9.25 kg"
    When the warm-up row is rendered
    Then the first warm-up set is "BW"
    And  no consecutive warm-up jump exceeds 4 kg
    And  there are 2 to 4 warm-up sets total

  Scenario: Dip warm-up starts at BW then steps up in ≤4 kg increments
    Given week 5 dip working weight is "+10.5 kg"
    When the warm-up row is rendered
    Then the first warm-up set is "BW"
    And  there are 2 to 4 warm-up sets total

  Scenario: Squat warm-up starts at empty bar (20 kg) then steps up in ≤40 kg increments
    Given week 1 squat working weight is "80 kg"
    When the warm-up row is rendered
    Then the first warm-up set is "20 kg"
    And  no consecutive warm-up jump exceeds 40 kg
    And  there are 2 to 4 warm-up sets total

  Scenario: Squat warm-up with low working weight shows only empty bar
    Given week 1 squat working weight is "30 kg"
    When the warm-up row is rendered
    Then the only warm-up set shown is "20 kg"

  Scenario: No warm-up shown on deload week for all main lifts
    Given the program is on week 7 (deload)
    Then pull-up warm-up row is hidden
    And  dip warm-up row is hidden
    And  squat warm-up row is hidden


# ─────────────────────────────────────────────────────────────────────────────
Feature: Set Tracking
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: Clicking a numbered set button marks it done
    Given week 1 pull-up card is visible
    When the user clicks set button "1"
    Then set button "1" appears highlighted (done state)

  Scenario: Clicking a done set button un-marks it
    Given week 1 pull-up set "1" is marked done
    When the user clicks set button "1" again
    Then set button "1" returns to the default (undone) state

  Scenario: Completing all mandatory sets marks the card as fully done
    Given week 1 pull-up has 4 mandatory sets
    When the user marks all 4 set buttons done
    Then the pull-up card receives the "all-done" visual state

  Scenario: Set state persists across page reloads
    Given the user has marked sets 1 and 2 done for week 1 pull-up
    When the page is reloaded
    Then set buttons 1 and 2 are still shown as done
    And  set buttons 3 and 4 are still shown as undone

  Scenario: Set state is stored per week so different weeks are independent
    Given set 1 for week 1 pull-up is marked done
    When the user views week 2 pull-up
    Then all set buttons for week 2 pull-up are in the default (undone) state


# ─────────────────────────────────────────────────────────────────────────────
Feature: Bonus Set
# Only available on the three main lifts: pull-up, dip, squat
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: Bonus button (★) is present only on main lifts
    Given the program is loaded
    Then the pull-up card has a ★ bonus button
    And  the dip card has a ★ bonus button
    And  the squat card has a ★ bonus button
    And  the tricep extension card has no ★ bonus button
    And  the lateral raise card has no ★ bonus button

  Scenario: Bonus button persists its state in localStorage
    Given the user marks the ★ bonus button done for week 1 pull-up
    When the page is reloaded
    Then the ★ bonus button for week 1 pull-up is still shown as done


# ─────────────────────────────────────────────────────────────────────────────
Feature: Outcome Indicator
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: No indicator shown when zero sets are touched
    Given all set buttons for week 1 pull-up are in the default (undone) state
    And   the ★ bonus button is not marked
    Then  the outcome indicator area is empty

  Scenario: Incomplete indicator shown when some but not all mandatory sets are done
    Given the user marks sets 1 and 2 done but not 3 and 4 for week 1 pull-up
    Then the outcome indicator shows "↺ Mandatory incomplete — weight repeats"

  Scenario: Done indicator shown when all mandatory sets are complete with no bonus
    Given the user marks all 4 mandatory sets done for week 1 pull-up
    And   the ★ bonus button is not marked
    Then the outcome indicator shows "✓ Mandatory done — normal progression"

  Scenario: Bonus indicator shown when all mandatory sets plus bonus are complete
    Given the user marks all 4 mandatory sets done for week 1 pull-up
    And   the user marks the ★ bonus button done
    Then the outcome indicator shows "⚡ Bonus — double jump next session"

  Scenario: Clicking bonus alone (no mandatory sets) still shows no indicator
    Given all mandatory set buttons for week 1 pull-up are undone
    When  the user clicks only the ★ bonus button
    Then  the outcome indicator area is empty


# ─────────────────────────────────────────────────────────────────────────────
Feature: Projected Weight
# The "proj" line appears below "target" on main lift cards and shows what
# the athlete will actually lift, computed from all prior weeks' outcomes.
# Rule: bonus = advance 2 indices in WEEKS array; normal = advance 1;
#        incomplete = advance 0 (stay); no data = advance 1 (follow target).
# W1 proj is always equal to the W1 target (chain baseline).
# ─────────────────────────────────────────────────────────────────────────────

  Scenario: Week 1 shows no projected line (it is the baseline)
    Given no localStorage data exists
    Then the pull-up card for week 1 shows no projected line

  Scenario: Week 2 proj is hidden when week 1 has no recorded data
    Given week 1 pull-up has no set state in localStorage
    Then the pull-up card for week 2 shows no projected line

  Scenario: Week 2 proj matches W2 target after completing W1 normally
    Given week 1 pull-up all 4 mandatory sets are marked done
    And   the ★ bonus is not marked for week 1 pull-up
    Then  week 2 pull-up projected line shows "✓ proj: +7.5 kg × 3"

  Scenario: Week 2 proj advances to W3 target after W1 bonus
    Given week 1 pull-up all 4 mandatory sets are marked done
    And   the ★ bonus is marked for week 1 pull-up
    Then  week 2 pull-up projected line shows "⚡ proj: +8.75 kg × 2"

  Scenario: Week 2 proj stays at W1 values after W1 incomplete
    Given week 1 pull-up sets 1 and 2 are done but sets 3 and 4 are not
    Then  week 2 pull-up projected line shows "↺ proj: +7.5 kg × 2"

  Scenario: Consecutive bonuses compound — each bonus skips one extra program week
    Given week 1 pull-up completed with bonus (projIdx advances to 2 → W3)
    And   week 2 pull-up (now at projected W3 values) completed with bonus
    Then  week 3 pull-up projected line shows "⚡ proj: +10 kg × 2"
    # projIdx chain: 0 →(+2)→ 2 →(+2)→ 4 → WEEKS[4] = {pull:10, pullReps:2}

  Scenario: After a bonus then a normal, chain advances correctly
    Given week 1 pull-up completed with bonus (projIdx 0→2)
    And   week 2 pull-up (at W3 values) completed normally (projIdx 2→3)
    Then  week 3 pull-up projected line shows "✓ proj: +8.75 kg × 3"
    # projIdx chain: 0 →(+2)→ 2 →(+1)→ 3 → WEEKS[3] = {pull:8.75, pullReps:3}

  Scenario: After a bonus then an incomplete, chain stays put
    Given week 1 pull-up completed with bonus (projIdx 0→2)
    And   week 2 pull-up incomplete (projIdx 2→2)
    Then  week 3 pull-up projected line shows "↺ proj: +8.75 kg × 2"
    # projIdx stays at 2 → WEEKS[2] = {pull:8.75, pullReps:2}

  Scenario: Squat proj advances one weight step after normal completion
    Given week 1 squat all 3 mandatory sets are marked done
    And   the ★ bonus is not marked for week 1 squat
    Then  week 2 squat projected line shows "✓ proj: 82.5 kg"

  Scenario: Squat proj skips one weight step after bonus
    Given week 1 squat all 3 mandatory sets are marked done
    And   the ★ bonus is marked for week 1 squat
    Then  week 2 squat projected line shows "⚡ proj: 85 kg"

  Scenario: Squat proj repeats weight after incomplete
    Given week 1 squat sets 1 done but sets 2 and 3 are not
    Then  week 2 squat projected line shows "↺ proj: 80 kg"

  Scenario: Deload week (W7) shows no projected line regardless of prior state
    Given all weeks up to week 6 are completed with bonus
    Then  week 7 pull-up card shows no projected line
    And   week 7 squat card shows no projected line
