// DraftGlance — the Live Activity UI for the Live Draft Session (EPIC-08).
// Lock screen card + Dynamic Island per mobile-app/docs/ARCHITECTURE.md.
// DraftActivityAttributes MUST stay field-for-field identical to the copy in
// modules/bbe-draft-native/ios/BBEDraftNativeModule.swift — ActivityKit
// matches the attribute type across the app/extension boundary by name.
import ActivityKit
import SwiftUI
import WidgetKit

struct DraftActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var phase: String
    var headline: String
    var picksUntil: Int
    var currentPick: Int
    var round: Int
    var myNextPick: Int
    var rosterBar: String
    var targets: [String]
    var syncedAtEpoch: Double
  }

  var platform: String
  var sessionId: String
}

// MARK: - Palette (mirrors src/theme.js)

private let bbeBackground = Color(red: 6 / 255, green: 14 / 255, blue: 31 / 255)      // #060E1F
private let bbeAccent = Color(red: 232 / 255, green: 191 / 255, blue: 74 / 255)       // #E8BF4A
private let bbeMuted = Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255)       // slate-400
private let bbeAlert = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)         // red-500

private func positionColor(_ pos: String) -> Color {
  switch pos {
  case "QB": return Color(red: 191 / 255, green: 68 / 255, blue: 239 / 255)
  case "RB": return Color(red: 16 / 255, green: 185 / 255, blue: 129 / 255)
  case "WR": return Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)
  case "TE": return Color(red: 59 / 255, green: 130 / 255, blue: 246 / 255)
  default: return bbeMuted
  }
}

/// Playoff-week medal ramp — mirrors the extension's W15/16/17 pill colors
/// (chrome-extension draft-overlay.js: bronze / silver / gold).
private func playoffWeekColor(_ week: String) -> Color {
  switch week {
  case "15": return Color(red: 205 / 255, green: 127 / 255, blue: 50 / 255)   // #CD7F32
  case "16": return Color(red: 201 / 255, green: 206 / 255, blue: 214 / 255)  // #C9CED6
  case "17": return Color(red: 255 / 255, green: 215 / 255, blue: 0 / 255)    // #FFD700
  default: return bbeMuted
  }
}

private func headlineColor(_ phase: String) -> Color {
  switch phase {
  case "onClock": return bbeAlert
  case "onDeck": return bbeAccent
  case "waiting", "away": return bbeMuted
  default: return .white
  }
}

// MARK: - Shared views

/// Fixed metric-column widths shared by the header strip and every row so
/// the P/S/C/E table stays aligned (TASK-337).
private enum TargetColumns {
  static let pos: CGFloat = 20
  static let playoff: CGFloat = 23
  static let stack: CGFloat = 12
  static let corr: CGFloat = 24
  static let exp: CGFloat = 24
  static let spacing: CGFloat = 4
}

/// Blank table cells render a faint dash so the columns stay visually fixed.
private let bbeDash = bbeMuted.opacity(0.5)

/// P column: single week in its medal color; multiple weeks ("15/17") as
/// "15+" in alert red — matching the extension's multi-week pill.
private func playoffText(_ weeks: String) -> Text {
  if weeks.isEmpty {
    return Text("–").font(.system(size: 9, weight: .medium)).foregroundColor(bbeDash)
  }
  if weeks.contains("/") {
    let first = weeks.components(separatedBy: "/").first ?? weeks
    return Text("\(first)+").font(.system(size: 9, weight: .heavy)).foregroundColor(bbeAlert)
  }
  return Text(weeks)
    .font(.system(size: 9, weight: .heavy).monospacedDigit())
    .foregroundColor(playoffWeekColor(weeks))
}

/// C / E columns: bare integers from JS; "%" is appended here.
private func metricText(_ value: String) -> Text {
  if value.isEmpty {
    return Text("–").font(.system(size: 9, weight: .medium)).foregroundColor(bbeDash)
  }
  return Text(value + "%")
    .font(.system(size: 9, weight: .semibold).monospacedDigit())
    .foregroundColor(bbeMuted)
}

/// P·S·C·E header strip; trailing fixed widths match TargetCell exactly.
private struct TargetHeader: View {
  private func label(_ s: String) -> some View {
    Text(s)
      .font(.system(size: 7, weight: .heavy))
      .kerning(0.5)
      .foregroundStyle(bbeMuted.opacity(0.65))
  }

  var body: some View {
    HStack(spacing: TargetColumns.spacing) {
      Spacer(minLength: 0)
      label("P").frame(width: TargetColumns.playoff, alignment: .center)
      label("S").frame(width: TargetColumns.stack, alignment: .center)
      label("C").frame(width: TargetColumns.corr, alignment: .trailing)
      label("E").frame(width: TargetColumns.exp, alignment: .trailing)
    }
  }
}

/// One table row, pre-formatted by JS as "WR·Downs·16·S·24·10"
/// (position · last name · playoff week(s) · stack · correlation % ·
/// exposure %; TASK-337). Blank fields arrive empty between separators.
private struct TargetCell: View {
  let line: String

  var body: some View {
    let parts = line.components(separatedBy: "·").map { $0.trimmingCharacters(in: .whitespaces) }
    let pos = parts.first ?? ""
    let name = parts.count > 1 ? parts[1] : line
    let weeks = parts.count > 2 ? parts[2] : ""
    let stack = parts.count > 3 ? parts[3] : ""
    let corr = parts.count > 4 ? parts[4] : ""
    let exp = parts.count > 5 ? parts[5] : ""
    HStack(spacing: TargetColumns.spacing) {
      Text(pos)
        .font(.system(size: 9, weight: .heavy))
        .foregroundStyle(positionColor(pos))
        .frame(width: TargetColumns.pos, alignment: .leading)
      // Name occupies only the leftover space after the fixed metric columns.
      // A full-width Color.clear defines that flexible box; the name is drawn
      // as an overlay at full intrinsic width and hard-clipped to the box —
      // so it renders as many letters as fit and never pushes the table (no
      // ellipsis, no column shove; TASK-337).
      Color.clear
        .frame(maxWidth: .infinity, minHeight: 15, maxHeight: 15)
        .overlay(alignment: .leading) {
          Text(name)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
        }
        .clipped()
      playoffText(weeks)
        .frame(width: TargetColumns.playoff, alignment: .center)
      Text(stack.isEmpty ? "–" : "✓")
        .font(.system(size: 9, weight: stack.isEmpty ? .medium : .heavy))
        .foregroundStyle(stack.isEmpty ? bbeDash : bbeAccent)
        .frame(width: TargetColumns.stack, alignment: .center)
      metricText(corr)
        .frame(width: TargetColumns.corr, alignment: .trailing)
      metricText(exp)
        .frame(width: TargetColumns.exp, alignment: .trailing)
    }
  }
}

/// Six targets in two columns, column-major so the top three (by the user's
/// own rankings) stay in the left column where the eye lands first. Each
/// column carries its own P·S·C·E header strip.
private struct TargetGrid: View {
  let targets: [String]

  var body: some View {
    let items = Array(targets.prefix(6))
    let rows = (items.count + 1) / 2
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 3) {
        TargetHeader()
        ForEach(0..<min(rows, items.count), id: \.self) { i in
          TargetCell(line: items[i])
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if items.count > rows {
        VStack(alignment: .leading, spacing: 3) {
          TargetHeader()
          ForEach(rows..<items.count, id: \.self) { i in
            TargetCell(line: items[i])
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

/// "P91 · R8" — pick bold white, round muted (TASK-337: replaces the
/// two-line pick/round readout and the synced-ago line).
/// (`foregroundColor`, not `foregroundStyle` — only the former returns Text
/// for `+` concatenation on the 16.2 deployment target.)
private func pickRoundText(_ state: DraftActivityAttributes.ContentState, size: CGFloat) -> Text {
  (Text("P\(state.currentPick)").foregroundColor(.white)
    + Text(" · R\(state.round)").foregroundColor(bbeMuted))
    .font(.system(size: size, weight: .heavy).monospacedDigit())
}

private struct LockScreenView: View {
  let state: DraftActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text("BB EXPOSURES")
          .font(.system(size: 10, weight: .heavy))
          .kerning(1.1)
          .foregroundStyle(bbeAccent)
        Spacer()
        if state.currentPick > 0 && state.phase != "armed" && state.phase != "waiting" {
          pickRoundText(state, size: 12)
        }
      }
      // Full-width headline — the pick readout moved up beside the brand
      // (TASK-337), keeping room for the long phase strings.
      Text(state.headline)
        .font(.system(size: 19, weight: .bold))
        .foregroundStyle(headlineColor(state.phase))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      if !state.targets.isEmpty {
        TargetGrid(targets: state.targets)
      }
      Text(state.rosterBar)
        .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
        .foregroundStyle(bbeMuted)
        .frame(maxWidth: .infinity, alignment: .center)
        .multilineTextAlignment(.center)
    }
    .padding(14)
  }
}

// MARK: - Widget

struct DraftGlanceLiveActivity: Widget {
  private func compactPicksText(_ state: DraftActivityAttributes.ContentState) -> String {
    if state.phase == "onClock" { return "GO" }
    if state.phase == "done" { return "✓" }
    if state.picksUntil < 0 { return "–" }
    return "\(state.picksUntil)"
  }

  var body: some WidgetConfiguration {
    ActivityConfiguration(for: DraftActivityAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(bbeBackground)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "bbexposures:///draft?view=assistant"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(context.state.headline)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(headlineColor(context.state.phase))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.currentPick > 0 {
            pickRoundText(context.state, size: 13)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 3) {
            if !context.state.targets.isEmpty {
              TargetGrid(targets: context.state.targets)
            }
            Text(context.state.rosterBar)
              .font(.system(size: 10, weight: .semibold).monospacedDigit())
              .foregroundStyle(bbeMuted)
          }
        }
      } compactLeading: {
        HStack(spacing: 2) {
          Image(systemName: "bolt.fill")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(bbeAccent)
          Text(compactPicksText(context.state))
            .font(.system(size: 13, weight: .heavy).monospacedDigit())
            .foregroundStyle(context.state.phase == "onClock" ? bbeAlert : .white)
        }
      } compactTrailing: {
        if context.state.currentPick > 0 {
          Text("P\(context.state.currentPick)")
            .font(.system(size: 12, weight: .bold).monospacedDigit())
            .foregroundStyle(bbeMuted)
        }
      } minimal: {
        Text(compactPicksText(context.state))
          .font(.system(size: 12, weight: .heavy).monospacedDigit())
          .foregroundStyle(context.state.phase == "onClock" ? bbeAlert : bbeAccent)
      }
      .widgetURL(URL(string: "bbexposures:///draft?view=assistant"))
      .keylineTint(bbeAccent)
    }
  }
}

@main
struct DraftGlanceBundle: WidgetBundle {
  var body: some Widget {
    DraftGlanceLiveActivity()
  }
}
