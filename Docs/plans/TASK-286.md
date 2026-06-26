# TASK-286: Arena: Vision_and_Scope + Feature Spec update for new pillar

**Status:** Approved (Level 3 auto-executed)
**Priority:** P2

## Objective
Per ADR-013, update `docs/Vision_and_Scope.md` to add the Arena as a new product pillar
and amend the three relaxed boundaries (social/comparison features; server-side backend;
Mirror-Not-Advisor scope), and add a `docs/Feature_Specs/Best_Ball_Arena.md` spec.

## Verification
- `Vision_and_Scope.md`: version bumped (2.1, 2026-06-26); new §2.2.9 Best Ball Arena; Principle #1 carve-out updated two → three places (analytics tabs remain unconditional); §2.4 client-side assumption scoped to analytics (bounded Arena server path noted); §3.2 exclusions for social features and server-side backend amended to "except the Arena, bounded", and the health-scores row adds the Arena to the carve-out. All reference ADR-013.
- `docs/Feature_Specs/Best_Ball_Arena.md` created following the house Feature-Spec format and accurately describing the shipped v1 (matches the implemented components, server contract, integrity controls, and the guest-vote decision).
- Mirror-Not-Advisor stays **unconditional** for the analytics tabs (no weakening).
- Independent verifier verdict vs ADR-013.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `docs/Vision_and_Scope.md` | Modify | Arena pillar + three boundary amendments + carve-out clarification |
| `docs/Feature_Specs/Best_Ball_Arena.md` | Create | Feature spec for the Arena |
