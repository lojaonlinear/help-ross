// ─── my-donations.js ──────────────────────────────────────────────────────
// Per-donor visual augmentation of `raised`.
//
// After a donation, the donor's session is recorded in localStorage so that
// when they return to the campaign (in the same browser) the displayed
// `raised` is augmented by their donation amount — for THAT browser only.
// Other users / browsers see the real value from Supabase.
//
// Auto-cleanup: when the admin updates raised manually (raised_current
// catches up with raised_before + amount), the local entry is removed so
// the donor stops seeing their own contribution duplicated on top.
//
// Excluded campaigns (skipped): Maria Herminia (f8bc2139-...) already has
// live raised tracking via webhook; adding the local override would cause
// double-counting.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict'

  var STORAGE_KEY = 'bff_my_donations'
  var SKIP_LOCAL = { 'f8bc2139-fdde-4274-a92b-cc1b2399ec9f': true }

  function _read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
    catch (e) { return {} }
  }

  function _write(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)) }
    catch (e) {}
  }

  // Save a new donation. Idempotent — same session_id won't be saved twice.
  function save(campId, sessionId, amount, raisedBefore) {
    if (!campId || !sessionId || !(amount > 0)) return
    var all = _read()
    var list = all[campId] || []
    for (var i = 0; i < list.length; i++) {
      if (list[i].session_id === sessionId) return // already saved
    }
    list.push({
      session_id: sessionId,
      amount: Number(amount),
      raised_before: Number(raisedBefore) || 0,
      timestamp: Date.now()
    })
    all[campId] = list
    _write(all)
  }

  // Return the amount to ADD on top of currentRaised, and auto-clean
  // entries where the real raised has caught up to (or passed) the
  // donation. Excluded campaigns always return 0.
  function getOverride(campId, currentRaised) {
    if (!campId || SKIP_LOCAL[campId]) return 0
    var all = _read()
    var list = all[campId] || []
    if (!list.length) return 0
    var total = 0
    var remaining = []
    var current = Number(currentRaised) || 0
    for (var i = 0; i < list.length; i++) {
      var d = list[i]
      // If real raised has caught up — admin counted it. Drop the entry.
      if (current >= (d.raised_before + d.amount)) continue
      total += Number(d.amount) || 0
      remaining.push(d)
    }
    if (remaining.length !== list.length) {
      all[campId] = remaining
      _write(all)
    }
    return total
  }

  // Convenience: mutate a campaign object in place.
  // Adds my donation total to camp.raised. Other derived fields (pct,
  // sup count, formatted strings) must be recomputed AFTER calling this.
  function applyToCampaign(camp) {
    if (!camp || !camp.id) return camp
    var extra = getOverride(camp.id, camp.raised)
    if (extra > 0) camp.raised = (Number(camp.raised) || 0) + extra
    return camp
  }

  window.bffMyDonations = {
    save: save,
    getOverride: getOverride,
    applyToCampaign: applyToCampaign
  }
})()
