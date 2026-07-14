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
  default: return .white
  }
}

// MARK: - Shared views

/// One target line, pre-formatted by JS as "WR · Chris Olave · FLAG".
private struct TargetRow: View {
  let line: String

  var body: some View {
    let parts = line.components(separatedBy: " · ")
    HStack(spacing: 6) {
      Text(parts.first ?? "")
        .font(.system(size: 11, weight: .heavy))
        .foregroundStyle(positionColor(parts.first ?? ""))
        .frame(width: 24, alignment: .leading)
      Text(parts.count > 1 ? parts[1] : line)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.white)
        .lineLimit(1)
      Spacer(minLength: 0)
      if parts.count > 2 {
        Text(parts[2])
          .font(.system(size: 10, weight: .heavy))
          .foregroundStyle(parts[2].contains("RISK") ? bbeAlert : bbeAccent)
          .lineLimit(1)
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
        if state.currentPick > 0 && state.phase != "armed" {
          Text("R\(state.round) · P\(state.currentPick)")
            .font(.system(size: 12, weight: .bold).monospacedDigit())
            .foregroundStyle(bbeMuted)
        }
      }
      if !state.targets.isEmpty {
        VStack(alignment: .leading, spacing: 3) {
          ForEach(state.targets.prefix(3), id: \.self) { line in
            TargetRow(line: line)
          }
        }
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
            ForEach(context.state.targets.prefix(3), id: \.self) { line in
              TargetRow(line: line)
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
