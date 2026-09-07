# Apple Shortcut: Sync Body Dashboard

Create a Shortcut named exactly:

**Sync Body Dashboard**

The dashboard's **Sync Health** button expects that name.

The Shortcut sends the last 30 days of Body Mass and Body Fat Percentage samples to the dashboard. Resending old samples is intentional: the dashboard de-duplicates them, so missed days get recovered automatically.

## Before starting

**Check your default browser first.** Step 15 uses *Open URLs*, which opens the
iPhone's **default browser**, and each iOS browser stores the dashboard's data
separately. If you read the dashboard in Chrome, set
**Settings → Chrome → Default Browser App → Chrome** before you start, or the Shortcut
will quietly file every measurement into Safari instead.

Have your GitHub Pages dashboard URL ready, for example:

`https://rafaelpdl.github.io/body-dashboard/`

When Shortcuts first asks for Health access, permit only the health categories required by this Shortcut.

## Part A — Weight samples

1. Add **Find Health Samples**.
   - Type: **Body Mass** / Weight
   - Filter: **Start Date is in the last 30 days**
   - Sort by: **Start Date**
   - Order: **Oldest First**

2. Add **Repeat with Each** using the Health Samples found above.

Inside the repeat:

3. Add **Get Details of Health Sample**.
   - Detail: **Start Date**
   - Input: **Repeat Item**

4. Add **Format Date**.
   - Input: the Start Date from step 3
   - Date Format: **ISO 8601**
   - Include ISO 8601 time: **On**

5. Add **Get Details of Health Sample** again.
   - Detail: **Value**
   - Input: **Repeat Item**

6. Add **Get Details of Health Sample** again.
   - Detail: **Source**
   - Input: **Repeat Item**

7. Add a **Text** action containing exactly this structure, replacing the bracketed items with the magic variables from steps 4–6:

`W|[ISO Date]|[Value]|[Source]`

8. Add **Add to Variable** and name the variable `Lines`.
   - Add the Text from step 7.

End the repeat.

## Part B — Body-fat samples

9. Add another **Find Health Samples**.
   - Type: **Body Fat Percentage**
   - Filter: **Start Date is in the last 30 days**
   - Sort by: **Start Date**
   - Order: **Oldest First**

10. Add another **Repeat with Each**.

Inside it, repeat steps 3–8, but the Text line must begin with `B`:

`B|[ISO Date]|[Value]|[Source]`

Add each generated line to the same `Lines` variable.

## Part C — Open the dashboard with the data

11. Add **Combine Text**.
   - Input: `Lines`
   - Separator: **New Lines**

12. Add **URL Encode**.
   - Input: the combined text.

13. Add a **Text** action:

`YOUR_DASHBOARD_URL#sync=[URL Encoded Text]`

Example beginning:

`https://rafaelpdl.github.io/body-dashboard/#sync=`

Insert the URL Encoded Text magic variable immediately after `#sync=`.

14. Add **URL** using the Text from step 13.

15. Add **Open URLs**.

## Test

Run the Shortcut manually. It should:

1. Read the Health samples.
2. Open your default browser at the dashboard.
3. Briefly include `#sync=...` in the URL.
4. Import/de-duplicate the samples locally.
5. Remove the `#sync=...` fragment from the address.
6. Show the new latest measurement in the charts.

The dashboard accepts both decimal commas and decimal points. It also accepts body-fat values represented either as a fraction (`0.185`) or percentage points (`18.5`).

### If you would rather not change the default browser

Instead of a plain `https://` URL in step 13, Chrome for iOS can be addressed directly
by swapping the scheme:

`googlechromes://rafaelpdl.github.io/body-dashboard/#sync=[URL Encoded Text]`

`googlechromes://` is Chrome's scheme for HTTPS pages, so this opens Chrome whatever
the default browser is. Test it once before relying on it: run the Shortcut and confirm
the sample count on the dashboard goes up. If the fragment does not survive the scheme
handoff, use the default-browser route above instead.

## Add the Shortcut to the Home Screen

In the Shortcuts app, open the Shortcut's details/share options and choose **Add to Home Screen**. This Shortcut icon should be your normal way to open the dashboard.

Daily use becomes:

**weigh yourself → wait for Fitdays to update Apple Health → tap Sync Body Dashboard**
