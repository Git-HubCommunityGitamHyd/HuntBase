import assert from "node:assert/strict";
import test from "node:test";
import {
    adminAccountMatchesSession,
    adjustedScore,
    canAccessTeamForAdmin,
    canAccessOrganization,
    eventOrganizationForCreation,
    legacyAdminMatchesSession,
    isValidScoreAdjustment,
    isValidEventTimeRange,
    isValidHuntDuration,
    isValidTeamCapacity,
    isValidTeamGenerationCount,
    MAX_GENERATED_TEAMS_PER_REQUEST,
    MAX_TEAM_SCORE,
    sanitizeClueUpdates,
    sanitizeEventUpdates,
    sanitizeTeamUpdates,
    teamOrganizationMatchesEvent,
} from "../src/lib/auth/admin-policy.ts";

const clubAdmin = { id: "admin-1", role: "club_admin", organization_id: "org-1" };
const superAdmin = { id: "root-1", role: "super_admin" };

test("current admin account must remain active with the same role and organization", () => {
    const activeRecord = {
        id: "admin-1",
        role: "club_admin",
        organization_id: "org-1",
        is_active: true,
    };
    assert.equal(adminAccountMatchesSession(clubAdmin, activeRecord), true);
    assert.equal(adminAccountMatchesSession(clubAdmin, { ...activeRecord, is_active: false }), false);
    assert.equal(adminAccountMatchesSession(clubAdmin, { ...activeRecord, role: "super_admin" }), false);
    assert.equal(adminAccountMatchesSession(clubAdmin, { ...activeRecord, organization_id: "org-2" }), false);
    assert.equal(adminAccountMatchesSession(clubAdmin, null), false);
    assert.equal(adminAccountMatchesSession(null, activeRecord), false);
});

test("clue update data cannot change tenant or caller identity", () => {
    assert.deepEqual(
        sanitizeClueUpdates({
            event_id: "other-event",
            organization_id: "org-2",
            role: "super_admin",
            clue_text: "Updated clue",
        }),
        { clue_text: "Updated clue" }
    );
});

test("club admin event creation uses its account organization despite forged request data", () => {
    assert.equal(eventOrganizationForCreation(clubAdmin, "org-evil"), "org-1");
    assert.equal(eventOrganizationForCreation(superAdmin, "org-2"), "org-2");
    assert.equal(eventOrganizationForCreation({ id: "root-2", role: "super_admin" }, undefined), null);
});

test("event updates cannot change organization or unsupported columns", () => {
    assert.deepEqual(
        sanitizeEventUpdates({ name: "Hunt", organization_id: "org-evil", created_at: "forged", hunt_started_at: "forged", is_active: true }),
        { name: "Hunt", is_active: true }
    );
});

test("event duration and timestamp validation enforce bounds and chronological order", () => {
    assert.equal(isValidHuntDuration(1), true);
    assert.equal(isValidHuntDuration(1440), true);
    for (const duration of [0, -1, 1441, 1.5, "60", Infinity]) {
        assert.equal(isValidHuntDuration(duration), false, String(duration));
    }
    assert.equal(isValidEventTimeRange("2026-10-25T10:00:00Z", "2026-10-25T11:00:00Z"), true);
    assert.equal(isValidEventTimeRange("invalid", "2026-10-25T11:00:00Z"), false);
    assert.equal(isValidEventTimeRange("2026-10-25T11:00:00Z", "2026-10-25T10:00:00Z"), false);
    assert.equal(isValidEventTimeRange("2026-10-25T10:00:00Z", "2026-10-25T10:00:00Z"), false);
});

test("team tenant ownership follows event_id while rejecting inconsistent organization IDs", () => {
    assert.equal(teamOrganizationMatchesEvent("org-1", "org-1"), true);
    assert.equal(teamOrganizationMatchesEvent(null, "org-1"), true);
    assert.equal(teamOrganizationMatchesEvent("org-2", "org-1"), false);
    assert.equal(canAccessOrganization(clubAdmin, "org-2"), false);
    assert.equal(canAccessOrganization(superAdmin, "org-2"), true);
});

test("team updates ignore ownership and identity fields and validate supported values", () => {
    assert.deepEqual(
        sanitizeTeamUpdates({
            organization_id: "org-evil",
            event_id: "event-evil",
            role: "super_admin",
            is_admin: true,
            score: 25,
        }),
        { score: 25 }
    );
    assert.equal(sanitizeTeamUpdates({ score: -1 }), null);
    assert.equal(sanitizeTeamUpdates({ score: "25" }), null);
    assert.equal(sanitizeTeamUpdates({ is_disqualified: "true" }), null);
});

test("team score adjustments preserve five-point steps and a zero floor", () => {
    assert.equal(isValidScoreAdjustment(5), true);
    assert.equal(isValidScoreAdjustment(-10), true);
    assert.equal(isValidScoreAdjustment(3), false);
    assert.equal(isValidScoreAdjustment("5"), false);
    assert.equal(adjustedScore(10, -15), 0);
    assert.equal(adjustedScore(10, 15), 25);
    assert.equal(adjustedScore(Number.MAX_SAFE_INTEGER, 5), null);
});

test("team capacity settings require positive ordered integer limits", () => {
    assert.equal(isValidTeamCapacity(2, 4), true);
    assert.equal(isValidTeamCapacity(0, 4), false);
    assert.equal(isValidTeamCapacity(5, 4), false);
    assert.equal(isValidTeamCapacity("2", 4), false);
});

test("club admins are limited to their organization and super admins may cross tenants", () => {
    assert.equal(canAccessOrganization(clubAdmin, "org-1"), true);
    assert.equal(canAccessOrganization(clubAdmin, "org-2"), false);
    assert.equal(canAccessOrganization(clubAdmin, null), false);
    assert.equal(canAccessOrganization(null, "org-1"), false);
    assert.equal(canAccessOrganization({ id: "player-1", role: "player" }, "org-1"), false);
    assert.equal(canAccessOrganization(superAdmin, "org-2"), true);
    assert.equal(canAccessOrganization(superAdmin, null), true);
});

test("legacy admin session requires the same team identity and stored organization", () => {
    const legacy = { id: "admin-1", organization_id: "org-1", is_admin: true };
    assert.equal(legacyAdminMatchesSession(clubAdmin, legacy), true);
    assert.equal(legacyAdminMatchesSession(clubAdmin, { ...legacy, is_admin: false }), false);
    assert.equal(legacyAdminMatchesSession(clubAdmin, { ...legacy, organization_id: "org-2" }), false);
    assert.equal(legacyAdminMatchesSession(superAdmin, legacy), false);
});

test("team access follows authorized event organization and legacy null team organization", () => {
    assert.equal(canAccessTeamForAdmin(clubAdmin, "org-1", "org-1"), true);
    assert.equal(canAccessTeamForAdmin(clubAdmin, null, "org-1"), true);
    assert.equal(canAccessTeamForAdmin(clubAdmin, "org-2", "org-1"), false);
    assert.equal(canAccessTeamForAdmin(clubAdmin, null, "org-2"), false);
    assert.equal(canAccessTeamForAdmin(superAdmin, "org-2", "org-2"), true);
    assert.equal(canAccessTeamForAdmin(clubAdmin, null, null), false);
});

test("score adjustments reject non-finite, fractional, string, and invalid step inputs", () => {
    for (const value of ["5", 2.5, NaN, Infinity, -Infinity, 1, -7]) {
        assert.equal(isValidScoreAdjustment(value), false, String(value));
        assert.equal(adjustedScore(10, value), null, String(value));
    }
    assert.equal(isValidScoreAdjustment(Number.MAX_SAFE_INTEGER), false);
    assert.equal(isValidScoreAdjustment(-15), true);
});

test("score calculation rejects invalid and database-overflowing current scores", () => {
    for (const score of [-1, 1.5, NaN, Infinity, null, MAX_TEAM_SCORE + 1]) {
        assert.equal(adjustedScore(score, 5), null, String(score));
    }
    assert.equal(adjustedScore(MAX_TEAM_SCORE, 5), null);
    assert.equal(adjustedScore(MAX_TEAM_SCORE - 5, 5), MAX_TEAM_SCORE);
    assert.equal(adjustedScore(10, -15), 0);
    assert.equal(adjustedScore(10, -5), 5);
});

test("team generation count enforces safe integer boundaries from 1 through the maximum", () => {
    assert.equal(isValidTeamGenerationCount(1), true);
    assert.equal(isValidTeamGenerationCount(MAX_GENERATED_TEAMS_PER_REQUEST), true);
    for (const count of [0, -1, MAX_GENERATED_TEAMS_PER_REQUEST + 1, 1.5, "2", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal(isValidTeamGenerationCount(count), false, String(count));
    }
});

test("team updates ignore protected fields and reject invalid mutable values", () => {
    assert.deepEqual(sanitizeTeamUpdates({ event_id: "forged", organization_id: "forged", is_admin: true, role: "super_admin", unknown: 1 }), null);
    assert.equal(sanitizeTeamUpdates({ score: -1 }), null);
    assert.equal(sanitizeTeamUpdates({ score: 1.2 }), null);
    assert.equal(sanitizeTeamUpdates({ score: Infinity }), null);
    assert.equal(sanitizeTeamUpdates({ is_disqualified: 1 }), null);
    assert.deepEqual(sanitizeTeamUpdates({ score: 20, is_disqualified: true }), { score: 20, is_disqualified: true });
});
