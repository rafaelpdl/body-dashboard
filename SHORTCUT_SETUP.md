# Apple Shortcut: Sync Body Dashboard

This Shortcut reads your last 30 days of Weight and Body Fat Percentage from Apple
Health, packs them into the dashboard's URL fragment, and opens the dashboard. It sends
the whole 30-day window every time on purpose: the dashboard de-duplicates, so repeats
cost nothing and any day a sync was missed is recovered automatically.

Name the Shortcut exactly:

**Sync Body Dashboard**

The dashboard's **Sync Health** button launches a shortcut by that exact name. (You can
name it anything if you only ever tap the Shortcut itself, but then that button won't
work.)

## Before you start

**1. Check your default browser.** The last action, *Open URLs*, opens the iPhone's
**default browser** — and every iOS browser keeps its own separate storage for the
dashboard. If you read the dashboard in Chrome, set
**Settings → Chrome → Default Browser App → Chrome** first, or this Shortcut will file
every measurement into Safari while you look at an empty Chrome.

**2. Have your dashboard URL ready:**

`https://rafaelpdl.github.io/body-dashboard/`

**3. The one thing that trips everyone up.** Shortcuts inserts a new action *directly
below the action you last tapped* — not at the bottom. So after you build the loop, the
next action you add lands **inside** the loop unless you first tap the **End Repeat**
row to move the insertion point past it.

If an action ends up in the wrong place, don't delete it: press and hold its drag
handle (the ≡ on the right, or just press and hold the action) and drag it where it
belongs.

**How to insert a variable into a text field:** tap the field, then tap the variable you
want from the suggestion row just above the keyboard. If the one you need isn't there,
tap the ⌥/*Select Variable* button in that row and pick it from the list.

**4. Two variable chips Shortcuts fills in wrong.** Shortcuts guesses an input for each
new action, and inside a loop it guesses badly. Check both of these every time:

- **Repeat Item, never Repeat Results.** *Repeat Item* is the one sample this pass of the
  loop is handling. *Repeat Results* is the collected output of the whole finished loop,
  so using it inside the loop reads something that does not exist yet. Shortcuts often
  auto-fills *Repeat Results* — tap the chip and change it to **Repeat Item**.
- **The plain Text, not its Name.** In *Add to Variable*, the chip must be the Text action's
  own output. If it reads *Name*, Shortcuts attached a file-property accessor to it and
  will store the wrong thing. Tap the chip and clear the property back to the whole value,
  or delete the chip and re-insert **Text** from the suggestion row.

A chip is changed the same way in both cases: tap it, then pick the variable (or the
property) you actually want.

## The finished Shortcut

Actions 4–8 sit **inside** the first Repeat; actions 13–17 sit **inside** the second.

Steps 2 and 11 are not decoration. Both Find actions output a variable called
**Health Samples**, and there is no way to tell the two chips apart on screen — naming
them makes each Repeat unambiguous, and makes a mis-wire visible instead of invisible.

| # | Action | Settings |
| --- | --- | --- |
| 1 | Find Health Samples | Type **Weight**, Start Date **is in the last 30 days**, Unit **kg**, Sort by **Start Date**, Order **Oldest First**, Limit **off** |
| 2 | Set Variable | Name **WeightSamples**, to **Health Samples** |
| 3 | Repeat with Each | Input: **WeightSamples** |
| 4 | ‎ ‎ Get Details of Health Sample | Detail **Start Date**, Input **Repeat Item** ← *not* Repeat Results |
| 5 | ‎ ‎ Format Date | Input: the **Start Date** from #4, Date Format **ISO 8601**, Include ISO 8601 Time **on** |
| 6 | ‎ ‎ Get Details of Health Sample | Detail **Value**, Input **Repeat Item** ← *not* Repeat Results |
| 7 | ‎ ‎ Text | `W` `\|` *Formatted Date* `\|` *Value* |
| 8 | ‎ ‎ Add to Variable | Add the plain **Text** (not its *Name*), to variable **Lines** |
| 9 | *(End Repeat)* | — |
| 10 | Find Health Samples | Type **Body Fat Percentage**, Unit **%**, same 30-day filter and sorting |
| 11 | Set Variable | Name **FatSamples**, to **Health Samples** |
| 12 | Repeat with Each | Input: **FatSamples** ← the whole point of steps 2 and 11 |
| 13 | ‎ ‎ Get Details of Health Sample | Detail **Start Date**, Input **Repeat Item** |
| 14 | ‎ ‎ Format Date | Date Format **ISO 8601**, Include ISO 8601 Time **on** |
| 15 | ‎ ‎ Get Details of Health Sample | Detail **Value**, Input **Repeat Item** |
| 16 | ‎ ‎ Text | `B` `\|` *Formatted Date* `\|` *Value* |
| 17 | ‎ ‎ Add to Variable | Add the plain **Text** to the same variable **Lines** |
| 18 | *(End Repeat)* | — |
| 19 | Combine Text | Input **Lines**, Separator **New Lines** |
| 20 | URL Encode | Input: the **Combined Text** — *not* `Lines` |
| 21 | Text | `https://rafaelpdl.github.io/body-dashboard/#sync=` + *URL Encoded Text* |
| 22 | Open URLs | Input: the **Text** from #21 |

Actions 19–22 are easy to forget: without them the Shortcut builds the lines correctly
and then does nothing with them. If your last action is **End Repeat**, Part C is missing.

The only difference between the two halves is the sample type and the `W` / `B` letter.

## Step by step

### Part A — weight

**1. Find Health Samples.** Tap **Search Actions** at the bottom, type `health`, tap
**Find Health Samples**. Set:

- **Type** → Weight
- **Add Filter** → Start Date → *is in the last* → 30 days
- **Unit** → kg
- **Sort by** → Start Date, **Order** → Oldest First, **Limit** → off

**2. Name the samples.** Search `set variable`, tap **Set Variable**. Type
`WeightSamples` as the name; its value is already the Health Samples from #1.

This step exists because you are about to create a *second* variable also called
*Health Samples*, and the two are indistinguishable on screen. Naming them is the only
reliable way to keep the loops pointed at the right list.

**3. Repeat with Each.** Search `repeat`, tap **Repeat with Each**, then tap its input
chip and choose **WeightSamples**.

You now have a **Repeat with Each … End Repeat** pair with an empty gap between them.
Everything in steps 3–7 goes in that gap, which is where Shortcuts will put them
automatically as long as you keep adding actions one after another.

**4. Get the date.** Search `get details of health`, tap **Get Details of Health
Sample**. It must read *"Get **Start Date** from **Repeat Item**"*.

Shortcuts will very likely fill the input with **Repeat Results** instead. That is the
wrong variable — tap the red *Repeat Results* chip and choose **Repeat Item**. Change the
detail to **Start Date** too if it came in as something else.

**5. Format the date.** Search `format date`, tap **Format Date**. Tap its input and
choose the output of #4 (offered as *Start Date* or *Health Sample Detail*). Then tap
**Date Format** → **ISO 8601**, and turn **Include ISO 8601 Time** on.

This step is not optional. Any other format is a localised date the dashboard cannot
read.

**6. Get the value.** Search `get details of health` again, tap **Get Details of Health
Sample**, set **Detail** → **Value**. Check the input here too — it must be
**Repeat Item**, not *Repeat Results*.

**7. Build the line.** Search `text`, tap **Text**. In the field, type `W` then `|`, tap
the **Formatted Date** variable, type `|`, tap the **Value** variable. It should look
like:

`W|Formatted Date|Value`

**8. Collect the line.** Search `add to variable`, tap **Add to Variable**. Type `Lines`
as the variable name.

Check the chip being added: it must be the plain **Text**. If it says **Name**, Shortcuts
has attached a property accessor and would store a filename instead of your line — tap the
chip and clear the property, or delete it and re-insert **Text** from the suggestion row
above the keyboard.

Part A is done. On screen you should see the Repeat block containing five actions.

### Part B — body fat

**Tap the "End Repeat" row now.** This is the step that makes the rest work — it moves
the insertion point below the loop, so the next action is added *after* it rather than
inside it.

**9. Find Health Samples** again, this time **Type → Body Fat Percentage**, same
30-day filter, same sorting.

**11. Name these samples too.** Add another **Set Variable**, named `FatSamples`.

**12. Repeat with Each → FatSamples.** This is where the shortcut most often goes wrong.
Shortcuts will offer *Health Samples* and point the loop at the **first** Find action's
output, and nothing on screen distinguishes the two. Pick **FatSamples** and the
ambiguity is gone for good.

Get this wrong and the shortcut runs perfectly while emitting `B|` lines carrying weight
values — see the troubleshooting note below.

**13–17.** Repeat steps 4–8 exactly, with one change: in the Text action write **`B`**
instead of `W`:

`B|Formatted Date|Value`

Add to the **same** `Lines` variable — type the same name and Shortcuts will append to
it rather than making a second variable.

### Part C — open the dashboard

**Tap the second "End Repeat" row** before adding these, so they land outside the loop.

Without these four actions the Shortcut assembles every line correctly and then throws
them away. If the last action in your Shortcut is **End Repeat**, this part is missing.

**19. Combine Text.** Search `combine`, tap **Combine Text**. Set Separator to
**New Lines**, then **tap the input chip and choose the `Lines` variable explicitly.**

Do not accept whatever Shortcuts auto-fills here. Left alone it binds to the previous
action's output, which after **End Repeat** is **Repeat Results** — and Repeat Results is
not your data. See the note below; this single chip is the most common reason a working
Shortcut suddenly produces hundreds of lines.

**20. URL Encode.** Search `url encode`, tap it. Input is the **Combined Text** from #19.
Pointing it at `Lines` instead hands it a list and encodes each line separately.

**21. Text.** Add a **Text** action containing your dashboard URL, `#sync=`, then the
URL Encoded Text variable — with nothing between them:

`https://rafaelpdl.github.io/body-dashboard/#sync=` *URL Encoded Text*

**22. Open URLs.** Search `open url`, tap **Open URLs**. Its input is the Text from #21.

## Test it

Tap ▶ at the bottom right. It should:

1. Ask for Health access the first time — allow Weight and Body Fat Percentage.
2. Open your browser at the dashboard.
3. Briefly show `#sync=…` in the address bar, then drop it.
4. Show a higher sample count in the line under the title.

**The check that matters:** note the "N local samples" number before running, and
confirm it goes up afterwards. If the charts don't change, see below.

## If something goes wrong

**Every line is identical, empty, or looks like a filename.** One of the two chips from
the *Before you start* section is wrong: *Repeat Results* where it should be *Repeat Item*,
or *Name* where it should be the plain *Text*. Expand each action inside the loop and
check them.

**Nothing imports / the count doesn't move.** Usually the date format. Temporarily
add a **Quick Look** action after #17 and run again: each line must look like
`W|2026-09-07T08:25:16-03:00|81.2`. If the date reads like *"7 Sept 2026 at 08:25"*,
go back to #4 and set Date Format to ISO 8601 with the time toggle on.

**The count goes up but the charts are empty in your browser.** The Shortcut opened a
*different* browser than the one you're looking at. See the default-browser note at the
top.

**Only weight appears, no body fat.** The second half's actions probably landed inside
the first loop, or `Lines` was spelled differently the second time. Check the indentation
and the variable name.

**Adding a Quick Look fixes it; removing the Quick Look breaks it again.** This is the
signature of the *Repeat Results* trap, and it is worth understanding because it explains
a result that otherwise looks impossible.

Shortcuts auto-fills each new action's input with the **previous action's output**. So a
Quick Look inserted after the loop is not a passive observer: it becomes the previous
action, and whatever follows silently binds to *its* output. Delete it and the next action
re-binds to **End Repeat** instead — a different value, with no visible change to the
action's wording.

What it re-binds to is the problem. **Repeat Results** is the output of the *last action of
every iteration*, and the last action in each of these loops is **Add to Variable**, whose
output is the entire `Lines` variable *as it stood on that pass*. So Repeat Results is not
30 lines — it is 30 cumulative snapshots of a growing list, and every weight line appears
in all 30 of them.

The fix is one chip: open **Combine Text** and set its input to the **Lines** variable
explicitly. A named variable means what it says on every run; an auto-filled magic variable
re-points itself whenever you insert or delete an action above it.

**You get 900 lines instead of 30 (30 x 30).** A Text action that contains a *list*
variable is emitted once per item in that list. So if one of the two **Get Details of
Health Sample** actions inside a loop has its input set to **Health Samples** — the whole
list — instead of **Repeat Item**, it hands back all 30 values at once, and every pass of
the loop writes 30 lines. Thirty passes x thirty lines = 900, pairing every date with
every value.

Which of the two is wrong is visible in the output:

- the **same date** repeated with 30 different values → the *Get **Value*** action
- the **same value** repeated with 30 different dates → the *Get **Start Date*** action

Open that action and set its input to **Repeat Item**. A correct loop emits exactly one
line per pass.

The same symptom, much more rarely, comes from a second **Repeat with Each** nested inside
the first — you would see two **End Repeat** rows one after another. Delete the inner one.

If you already ran a sync with the bad lines, no cleanup is needed. Records are keyed by
metric + exact instant + source, so re-running the corrected shortcut overwrites each
day's wrong value with the right one.

**`B|` lines carry weight numbers** (e.g. `B|2026-08-08T10:55:47-03:00|83.9` when your
body fat is around 23 %). The second **Repeat with Each** is iterating the *first* Find
action's samples — both are named *Health Samples*, and Shortcuts picks the wrong one by
default. Tap that chip and select the Health Samples produced by the Body Fat Percentage
action.

Quickest confirmation: look for a `W|` line with the **same timestamp and the same
number**. If the pair exists, the second loop is reading weight.

The permanent fix is steps 2, 11 and 12 above: give each Find action's output its own
name with **Set Variable**, and point each Repeat at that name. Two chips both reading
*Health Samples* cannot be told apart by eye.

Nothing is corrupted while this is wrong. The dashboard rejects any body-fat reading above
80 %, so those lines are dropped on import rather than stored — you would just see weight
charts fill in and the body-fat chart stay empty.

**Values arrive as `83.90000152587891`.** That is normal and nothing to fix. Apple Health
stores quantities as 32-bit floats; the dashboard rounds them on import.

**Nothing at all happens on the first run.** The Health permission prompt may have been
dismissed. Delete the Shortcut's health access under
Settings → Privacy & Security → Health → Shortcuts, then run again.

### If you'd rather not change the default browser

In step 19, swap the scheme to address Chrome directly:

`googlechromes://rafaelpdl.github.io/body-dashboard/#sync=` *URL Encoded Text*

`googlechromes://` is Chrome's scheme for HTTPS pages, so it opens Chrome whatever the
default browser is. Test it once and confirm the sample count rises — if the fragment
doesn't survive the scheme handoff, use the default-browser route instead.

## Optional: drop the Source

Earlier versions of this guide had a sixth action inside each loop reading the sample's
**Source** and appending it as a fourth field (`W|date|value|Fitdays`). It is optional —
the dashboard defaults the source to *Apple Health* when it is missing, and only uses it
to choose between two apps that wrote a measurement on the same day. If you want it, add
a **Get Details of Health Sample → Source** action before the Text action and end the
line with `|` + *Source*.

## Add the Shortcut to the Home Screen

In the Shortcuts app, open the Shortcut's share options and choose **Add to Home
Screen**. Use that icon as your normal way in — **do not** use *Add to Home Screen* on
the dashboard web page itself, because an installed web app gets its own storage,
separate from the browser this Shortcut opens.

Daily routine: **weigh yourself → wait for Fitdays to reach Apple Health → tap the
Shortcut icon.**

The dashboard accepts decimal points and decimal commas, and body fat either as
percentage points (`18.5`) or as a fraction (`0.185`).
