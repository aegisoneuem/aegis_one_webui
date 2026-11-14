# The custom widget wizard — what the contract has to gain first

Read out of the running reference (`v129`, demo mode), not guessed. This is
the proposal; nothing below is built yet.

## What the wizard collects

| Step      | Collects                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Start   | one of ten templates, or blank                                                                                                                                                                                   |
| 2 Data    | subject: Devices · Patches · Compliance Checks · Deployments · Software Installs · Software Catalog                                                                                                              |
| 3 Measure | count · % of total · average · total · lowest · highest; the last four add an "of field" picker over the subject's numeric fields                                                                                |
| 4 Views   | one or more views: group by (a dimension, or "None (KPI number)"), chart (donut · pie · column · bar · rings), sort (highest first · name A–Z), show (all · top 5 · top 10 · top 15); plus "hide Not set values" |
| 5 Filters | match all / any, over rules of field · operator · value; operators: is, is not, is any of, contains, does not contain, greater than, less than, is empty, is not empty                                           |
| 6 Display | name, size (one third · half · full), place after (a widget, or end of overview), optional target %                                                                                                              |

A live preview runs throughout and redraws on every change.

## Addition 1 — somewhere to keep the definition

`OverviewLayout.widgets[]` carries `id`, `type`, `visible`, `chartType`,
`view` and `title`. None of the above fits. Proposed: a widget whose `type`
is `custom` also carries `definition`:

```yaml
definition:
  type: object
  additionalProperties: false
  required: [source, measure, views]
  properties:
    source:
      type: string
      enum: [devices, patches, checks, deployments, software-installs, software-catalog]
    measure:
      type: object
      additionalProperties: false
      required: [agg]
      properties:
        agg: { type: string, enum: [count, pct, avg, sum, min, max] }
        field: { type: string, maxLength: 64 } # required for avg/sum/min/max
    views:
      type: array
      minItems: 1
      maxItems: 4
      items:
        type: object
        additionalProperties: false
        required: [chart]
        properties:
          groupBy: { type: string, maxLength: 64 } # absent = a single KPI number
          chart: { type: string, enum: [donut, pie, column, bar, rings] }
          sort: { type: string, enum: [value, name] }
          limit: { type: integer, enum: [0, 5, 10, 15] } # 0 = all
    hideNotSet: { type: boolean }
    filter:
      type: object
      additionalProperties: false
      required: [match, rules]
      properties:
        match: { type: string, enum: [all, any] }
        rules:
          type: array
          maxItems: 20
          items:
            type: object
            additionalProperties: false
            required: [field, op]
            properties:
              field: { type: string, maxLength: 64 }
              op:
                type: string
                enum: [eq, ne, in, like, nlike, gt, lt, empty, notEmpty]
              value: { type: string, maxLength: 200 }
    size: { type: string, enum: [third, half, full] }
    placeAfter: { type: string, maxLength: 64 }
    targetPct: { type: integer, minimum: 1, maximum: 100 }
```

The nine operators are the ones the reference offers, mapped onto the names
`clauseFor` already uses, so a widget's filter goes through the same column
allowlist, operator allowlist and parameter binding as every other filter in
the server. Nothing would reach SQL by another route.

## Addition 2 — an endpoint that can answer it

Nothing in the contract returns a grouped aggregate for an arbitrary
subject. `CustomReportInput` is `columns`, `filter` and `sort` — row
oriented. Proposed:

```
POST /overview/widget-data        x-required-permission: overview:read
  body: the definition above, plus the Overview's own zone/platform/department scope
  200:  { total, matched, series: [ { key, label, value, pct } ], unit }
```

`POST` rather than `GET` because the definition does not fit in a query
string and must not be logged in one. It is a read: no `x-csrf` and no
write permission, which is the same shape `/reports/{id}/run` already has.

One endpoint serves both the wizard's live preview and the widget on the
Overview, so the preview cannot show something the page would then draw
differently — which is the failure the reference's own "LIVE PREVIEW · SAME
AS ON OVERVIEW" label is promising against.

## What this does not cover

The ten templates are starting points, not data: each is a definition the
console can hold. They need no contract.
