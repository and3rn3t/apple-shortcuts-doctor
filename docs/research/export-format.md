# Research: what real Shortcut exports look like

- **Date**: 2026-10-27
- **Tool**: [`scripts/profile-exports.mjs`](../../scripts/profile-exports.mjs)
- **Corpus**: 138 published Shortcuts (see [Method](#method))

The inspector was built from Apple's file format as we understood it, plus synthetic fixtures. This
note records what a corpus of real exports actually contains, so parsing and rules are checked
against evidence instead of assumptions.

## Method

- **Source.** Every `icloud.com/shortcuts/<id>` link that GitHub code search found in public
  Markdown files (138 unique links from 41 repositories, all posted by their authors for
  distribution). For each link, the record's unsigned `shortcut` asset was downloaded, as
  described in the README's [Getting an export](../../README.md#getting-an-export).
- **Not committed.** The exports are third-party content, so they stay on the researcher's
  machine. Only the aggregate numbers below are recorded.
- **Stats only.** `profile-exports.mjs` prints counts, key names, Apple enum values (sanitized to
  `[A-Za-z0-9._-]`), and action identifiers. It never prints parameter values, UUIDs, names, or
  paths. An integration test enforces this against the fixtures.
- **Reproduce** with any folder of exports:

  ```bash
  node scripts/profile-exports.mjs path/to/exports > profile.json
  ```

Apple's own action list wasn't usable as a reference. On macOS 26, `ActionKit.framework` ships
localized strings, an intent definition, and App Intents metadata for only 19 newer actions; the
identifier table is compiled into the shared cache. Real exports are the practical source of truth.

## Findings

### Decoding

| Check                                              | Result                                     |
| -------------------------------------------------- | ------------------------------------------ |
| Container                                          | 138 / 138 binary plist (`bplist00`)        |
| Decoded by 0.3.0                                   | **126 / 138** (12 failed, see below)       |
| Decoded after the 16-byte integer fix              | 138 / 138                                  |
| Matches Python `plistlib`                          | 138 / 138 (dates agree to the millisecond) |
| Inspection errors (shape, identifier, size limits) | 0                                          |
| Identifiers rejected by the identifier pattern     | 0 of 157 distinct                          |

**16-byte integers.** CoreFoundation writes unsigned 64-bit numbers as 16-byte signed integers
(bplist marker `0x14`) even when they are small. Date-math actions store their calendar `Unit`
this way (4 = day, 16 = hour). The 0.3.0 decoder rejected the marker, which broke 8.7% of the
corpus. Fixed in #75.

### Size

| Actions per Shortcut | min | median | p90 | max | over the 2000 limit |
| -------------------- | --- | ------ | --- | --- | ------------------- |
| 138 Shortcuts        | 1   | 26     | 619 | 916 | 0                   |

The 2000-action limit leaves about 2× headroom over the largest Shortcut seen.

### Top-level keys

Only `WFWorkflowActions` is validated today. Every Shortcut also had `WFWorkflowClientVersion`,
`WFWorkflowIcon`, `WFWorkflowImportQuestions`, `WFWorkflowInputContentItemClasses`, and
`WFWorkflowTypes`. Most had `WFWorkflowMinimumClientVersion` (136) and
`WFWorkflowMinimumClientVersionString` (128). Newer exports add `WFWorkflowHasOutputFallback`,
`WFWorkflowHasShortcutInputVariables`, `WFWorkflowOutputContentItemClasses` (77 each), and
`WFQuickActionSurfaces` (76). Rare: `WFWorkflowClientRelease` (12, old exports),
`WFWorkflowNoInputBehavior` (7), and `WFWorkflowIsDisabledOnLockScreen` (1). The name isn't in
the export; iCloud keeps it on the record.

- **Client versions** range from `700` (iOS 12 era) to `4407`, in 44 distinct values. The most
  common are `1092.x` and `1050.x`.
- **Minimum client versions:** `900` (108), `1106` (12), `411` (8), `1113` (7), `3010` (1).
- **Workflow types:** `Watch` (53), `ActionExtension` (52), `NCWidget` (44), `QuickActions` (17),
  `MenuBar` (7), `WatchKit` (7), `WFWorkflowTypeShowInSearch` (5), `ReceivesOnScreenContent` (2).
- **Import questions:** 22 Shortcuts ask 51 questions on import.

These are the inputs #46 (compatibility checks) needs.

### Parameters and references

**Serialization types** (`WFSerializationType`): `WFTextTokenAttachment` (12,007),
`WFTextTokenString` (9,472), `WFDictionaryFieldValue` (600), `WFNumberSubstitutableState` (248),
`WFArrayParameterState` (124), `WFContentPredicateTableTemplate` (24), `WFQuantityFieldValue`
(13), `WFStringSubstitutableState` (5), `WFTimeOffsetValue` (2), and
`WFTokenAttachmentParameterState` (1).

**Where references sit.** All of them are in one of three places:

| Container                                | Path to the reference                                               | Count         |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------- |
| `WFTextTokenAttachment`                  | `Value.OutputUUID` / `Value.VariableName`                           | 5,834 / 6,062 |
| `WFTextTokenString`                      | `Value.attachmentsByRange.{range}.…`                                | 2,582 / 3,819 |
| Menu item titles (no serialization type) | `WFMenuItemAttributedTitle.attachmentsByRange.{range}.VariableName` | 206           |

The current walker finds `OutputUUID` at any depth, so it already covers all three.

**Attachment types** (`Type`): `Variable` (11,777), `ActionOutput` (8,416), `ExtensionInput`
(117, the Shortcut's input), `CurrentDate` (52), `Ask` (20), `Clipboard` (11), and
`DeviceDetails` (2). Aggrandizements (property access and type coercion on a reference) appear
5,964 times: `WFDictionaryValueVariableAggrandizement` (4,254),
`WFCoercionVariableAggrandizement` (3,327), `WFPropertyVariableAggrandizement` (253), and
`WFDateFormatVariableAggrandizement` (30).

- **Named variables are more common than direct outputs.** There are 10,087 `VariableName`
  references against 8,416 `OutputUUID` ones. Today none of the variable references are linked
  or counted, so most data flow in real Shortcuts is invisible (#39, #41).
- **Magic variables are data sources the rules can't see.** A `Clipboard` attachment reads the
  clipboard without any Get Clipboard action, and `Ask` and `DeviceDetails` are inputs too. 11
  clipboard reads in the corpus produce no `sensitive-input` finding.

**Control flow.** `WFControlFlowMode` is `0` (start) 2,456 times, `1` (else or menu item) 2,205
times, and `2` (end) 2,456 times. Starts and ends always balance, which is what #38 relies on.

### Rule catalog

157 distinct identifiers appear: 85 are in the catalog, 63 are Apple actions it doesn't cover
(925 uses), and 9 are third-party App Intents (36 uses). Overall, 4.2% of 22,922 actions are
unknown.

- **Wrong identifiers.** `getfile`, `deletefiles`, and `selectphotos` never appear; real exports
  use `documentpicker.open`, `file.delete`, and `selectphoto`. Fixed in #76.
- **Most-used Apple gaps:** `documentpicker.save` (221), `showwebpage` (92),
  `file.createfolder` (56), `overlayimageonimage` (25), `file.append` (20), the Accessibility
  `AXSetLargeTextIntent` (16), `image.resize` (15), `image.convert` (14), `gettypeaction` (13),
  `properties.weather.conditions` (12), `detect.images`, `filter.files`, `getmyworkflows`,
  `image.crop` (10 each), and `text.translate` (9). Tracked in #44.
- **Third-party intents seen:** Scriptable (`RunScriptInlineIntent`, 22), Shadowrocket, LLMFarm,
  a-Shell mini, Drafts, Gifski, Hamster. Scriptable runs inline JavaScript, so it deserves a
  `code-execution` rule (#45).
- **Catalog IDs not seen** in this corpus (probably correct, just rare): `getlatestphotos`,
  `takephoto`, `takevideo`, `recordaudio`, `selectcontacts`, `getupcomingevents`,
  `filter.reminders`, `getupcomingreminders`, `url.expand`, `getipaddress`, `sendmessage`,
  `airdropdocument`, `runjavascriptforautomation`, `text`, `vibrate`, `measurement.create`,
  `detect.date`, `correctspelling`, `getmarkdownfromrichtext`, and `getbatterylevel`. These
  need checking against exports that use them.

## Limits of this corpus

- It's biased toward Shortcuts that developers publish on GitHub: utilities, app integrations,
  and Chinese-language collections are overrepresented, and personal automations are rare.
- All 138 are binary plists, because that's what iCloud serves. XML and JSON exports come from
  other tools and still rely on the fixtures.
- Re-run the profile when Apple ships a new major OS, to catch format drift (new top-level keys,
  serialization types, or attachment types).
