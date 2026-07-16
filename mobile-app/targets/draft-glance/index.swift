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

private func headlineColor(_ phase: String) -> Color {
  switch phase {
  case "onClock": return bbeAlert
  case "onDeck": return bbeAccent
  case "waiting", "away": return bbeMuted
  default: return .white
  }
}

// MARK: - Shared views

/// Per-character flag glyphs: S stack · P playoff stack · Q queue risk ·
/// F falling. Q renders alert-red, the rest accent gold.
/// (`foregroundColor`, not `foregroundStyle` — only the former returns Text
/// for `+` concatenation on the 16.2 deployment target.)
private func flagText(_ flags: String, size: CGFloat) -> Text {
  flags.reduce(Text("")) { acc, ch in
    acc + Text(String(ch))
      .font(.system(size: size, weight: .heavy))
      .foregroundColor(ch == "Q" ? bbeAlert : bbeAccent)
  }
}

/// One grid cell, pre-formatted by JS as "WR·Olave·23·SP"
/// (position · last name · exposure % · flag glyphs; TASK-336).
private struct TargetCell: View {
  let line: String

  var body: some View {
    let parts = line.components(separatedBy: "·").map { $0.trimmingCharacters(in: .whitespaces) }
    let pos = parts.first ?? ""
    let name = parts.count > 1 ? parts[1] : line
    let exp = parts.count > 2 ? parts[2] : ""
    let flags = parts.count > 3 ? parts[3] : ""
    HStack(spacing: 4) {
      Text(pos)
        .font(.system(size: 9, weight: .heavy))
        .foregroundStyle(positionColor(pos))
        .frame(width: 20, alignment: .leading)
      Text(name)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
      Spacer(minLength: 2)
      if !exp.isEmpty {
        Text(exp + "%")
          .font(.system(size: 9, weight: .semibold).monospacedDigit())
          .foregroundStyle(bbeMuted)
      }
      if !flags.isEmpty {
        flagText(flags, size: 9)
      }
    }
  }
}

/// Six targets in two columns, column-major so the top three (by the user's
/// own rankings) stay in the left column where the eye lands first.
private struct TargetGrid: View {
  let targets: [String]

  var body: some View {
    let items = Array(targets.prefix(6))
    let rows = (items.count + 1) / 2
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 3) {
        ForEach(0..<min(rows, items.count), id: \.self) { i in
          TargetCell(line: items[i])
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if items.count > rows {
        VStack(alignment: .leading, spacing: 3) {
          ForEach(rows..<items.count, id: \.self) { i in
            TargetCell(line: items[i])
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

private struct SyncedAgoText: View {
  let epoch: Double

  var body: some View {
    if epoch > 0 {
      // Self-ticking relative timestamp — needs no activity updates.
      HStack(spacing: 3) {
        Text("synced")
        Text(Date(timeIntervalSince1970: epoch), style: .relative)
          .frame(maxWidth: 56, alignment: .leading)
        Text("ago")
      }
      .font(.system(size: 10, weight: .medium))
      .foregroundStyle(bbeMuted)
    } else {
      Text("not synced yet")
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(bbeMuted)
    }
  }
}

private struct LockScreenView: View {
  let state: DraftActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text("BB EXPOSURES")
          .font(.system(size: 10, weight: .heavy))
          .kerning(1.1)
          .foregroundStyle(bbeAccent)
        Spacer()
        SyncedAgoText(epoch: state.syncedAtEpoch)
      }
      HStack(alignment: .firstTextBaseline) {
        Text(state.headline)
          .font(.system(size: 19, weight: .bold))
          .foregroundStyle(headlineColor(state.phase))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        Spacer()
        if state.currentPick > 0 && state.phase != "armed" && state.phase != "waiting" {
          Text("R\(state.round) · P\(state.currentPick)")
            .font(.system(size: 12, weight: .bold).monospacedDigit())
            .foregroundStyle(bbeMuted)
        }
      }
      if !state.targets.isEmpty {
        TargetGrid(targets: state.targets)
      }
      Text(state.rosterBar)
        .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
        .foregroundStyle(bbeMuted)
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
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.headline)
              .font(.system(size: 15, weight: .bold))
              .foregroundStyle(headlineColor(context.state.phase))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            SyncedAgoText(epoch: context.state.syncedAtEpoch)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if context.state.currentPick > 0 {
            VStack(alignment: .trailing, spacing: 2) {
              Text("P\(context.state.currentPick)")
                .font(.system(size: 15, weight: .heavy).monospacedDigit())
                .foregroundStyle(.white)
              Text("Round \(context.state.round)")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(bbeMuted)
            }
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
