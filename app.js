// ============================================================
// COMPLETE APPLICATION LOGIC - ALL IN ONE FILE
// ============================================================

// Direct API access - works with Live Server
const USE_DIRECT_API = true;

console.log('VJudge API Mode: Direct (Live Server compatible)');
console.log('Current origin:', window.location.origin);

const contestCache = new Map();
const contestInfoCache = new Map(); // Store contest names
const selectionState = {
  mode: 'all',
  contestIds: [],
  selected: new Set(),
  eloMode: 'normal'
};
let autoRefreshTimer = null;
let contestFetchTimer = null;
const AUTO_REFRESH_DELAY = 800;
const CONTEST_FETCH_DELAY = 500;

function registerInputListener(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (inputId === 'contestInput') {
    input.addEventListener('input', () => {
      scheduleContestFetch();
    });
  } else {
    input.addEventListener('input', () => {
      scheduleAutoRefresh();
    });
  }
}

function scheduleContestFetch() {
  clearTimeout(contestFetchTimer);
  contestFetchTimer = setTimeout(() => {
    fetchAndDisplayContests();
  }, CONTEST_FETCH_DELAY);
}

async function fetchAndDisplayContests() {
  const { contestIds, invalidIds } = collectInputs();
  
  const container = document.getElementById('results');
  
  // Show validation errors for invalid IDs
  if (invalidIds.length > 0) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.style.marginBottom = '16px';
    errorDiv.innerHTML = `<strong>Invalid Contest IDs:</strong> Contest IDs must be numbers only. Invalid entries: ${invalidIds.join(', ')}`;
    container.innerHTML = '';
    container.appendChild(errorDiv);
    prepareAggregateView([]);
    refreshAggregateRanking();
    refreshEloStandings();
    return;
  }
  
  if (!contestIds.length) {
    container.innerHTML = '';
    prepareAggregateView([]);
    refreshAggregateRanking();
    refreshEloStandings();
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const contestId of contestIds) {
    // Skip if already fetched successfully
    if (contestCache.has(contestId) && contestInfoCache.has(contestId)) {
      continue;
    }

    const contestDiv = document.createElement('div');
    contestDiv.className = 'contest';
    contestDiv.id = `contest-${contestId}`;

    // Show loading state
    contestDiv.innerHTML = `<h2>Contest ${contestId}</h2><div class="loading" style="padding: 20px;"><div class="spinner"></div><p>Fetching contest data...</p></div>`;
    
    // Try to fetch
    const contestData = await ensureContestData(contestId, { forceRefetch: false });
    
    if (contestData.error) {
      const contestName = contestInfoCache.get(contestId) || `Contest ${contestId}`;
      const contestUrl = `https://vjudge.net/contest/${contestId}`;
      contestDiv.innerHTML = `<h2><a href="${contestUrl}" target="_blank" rel="noopener noreferrer">${contestName}</a></h2><div class="error">${contestData.error}</div>`;
    } else {
      const contestName = contestInfoCache.get(contestId) || `Contest ${contestId}`;
      const contestUrl = `https://vjudge.net/contest/${contestId}`;
      contestDiv.innerHTML = `<h2><a href="${contestUrl}" target="_blank" rel="noopener noreferrer">${contestName}</a></h2><div class="team" style="border-left: 4px solid #2196F3; background: #E3F2FD;"><span class="team-name">✓ Contest loaded successfully</span><span>Add team names to view rankings</span></div>`;
    }
    
    fragment.appendChild(contestDiv);
  }

  // Update or append contest divs
  const existingContests = new Set(
    Array.from(container.querySelectorAll('.contest'))
      .map(div => div.id.replace('contest-', ''))
  );

  // Remove contests that are no longer in the input
  Array.from(container.querySelectorAll('.contest')).forEach(div => {
    const id = div.id.replace('contest-', '');
    if (!contestIds.includes(id)) {
      div.remove();
    }
  });

  // Append new contests
  if (fragment.childNodes.length > 0) {
    container.appendChild(fragment);
  }

  prepareAggregateView(contestIds);
  refreshAggregateRanking();
  refreshEloStandings();
  scheduleAutoRefresh();
}

function scheduleAutoRefresh() {
  clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(() => {
    renderResults({ forceRefetch: false, useCacheOnly: false, showSpinner: false, silentErrors: true })
      .catch(err => console.error('Auto refresh error', err));
  }, AUTO_REFRESH_DELAY);
}

function initAggregateControls() {
  const modeRadios = document.querySelectorAll('input[name="mergeMode"]');
  modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      selectionState.mode = radio.value;
      if (selectionState.mode === 'all') {
        selectionState.selected = new Set(selectionState.contestIds);
      } else if (!selectionState.selected.size && selectionState.contestIds.length) {
        selectionState.selected = new Set([selectionState.contestIds[0]]);
      }
      updateContestChips(selectionState.contestIds);
      refreshAggregateRanking();
      refreshEloStandings();
    });
  });

  const chipsContainer = document.getElementById('contestChips');
  if (chipsContainer) {
    chipsContainer.addEventListener('change', (event) => {
      if (event.target.matches('input[type="checkbox"]')) {
        const contestId = event.target.value;
        if (event.target.checked) {
          selectionState.selected.add(contestId);
        } else {
          selectionState.selected.delete(contestId);
        }
        refreshAggregateRanking();
        refreshEloStandings();
      }
    });
  }
}

function initEloModeControls() {
  const eloRadios = document.querySelectorAll('input[name="eloMode"]');
  eloRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      selectionState.eloMode = radio.value;
      refreshEloStandings();
    });
  });
}

function updateContestChips(contestIds) {
  const chips = document.getElementById('contestChips');
  if (!chips) return;
  chips.innerHTML = '';

  if (!contestIds.length) {
    chips.innerHTML = '<p class="chips-empty">Enter contest IDs to load options.</p>';
    chips.classList.remove('active');
    return;
  }

  contestIds.forEach(id => {
    const label = document.createElement('label');
    label.className = 'contest-chip';
    const checked = selectionState.selected.has(id);
    const disabledAttr = selectionState.mode !== 'custom' ? 'disabled' : '';
    const contestName = contestInfoCache.get(id) || `Contest ${id}`;
    label.innerHTML = `
      <input type="checkbox" value="${id}" ${checked ? 'checked' : ''} ${disabledAttr}>
      <span>${contestName}</span>
    `;
    chips.appendChild(label);
  });

  chips.classList.toggle('active', selectionState.mode === 'custom');
}

async function fetchContestRank(contestId) {
  try {
    // Direct API call to VJudge
    const url = `https://vjudge.net/contest/rank/single/${contestId}`;
    
    const resp = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!resp.ok) {
      console.warn('Could not fetch rank for contest', contestId, resp.status);
      return { error: `Contest ${contestId} not found or is private` };
    }
    
    const data = await resp.json();
    
    // Store contest name if available
    if (data.title) {
      contestInfoCache.set(contestId, data.title);
    }
    
    return data;
  } catch (error) {
    console.error('Fetch error for contest', contestId, error);
    
    // More helpful error message
    let errorMessage = error.message;
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      errorMessage = `Contest ${contestId} not found or network error`;
    }
    
    return { error: errorMessage };
  }
}

const PENALTY_PER_WRONG = 20 * 60; // 20 ICPC minutes in seconds
const ELO_BASE_RATING = 1500;
const ELO_K_FACTOR = 32;

const normalizeName = (value = '') => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function formatPenalty(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '0s';
  }
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (hours || minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function formatRating(value) {
  if (!Number.isFinite(value)) {
    return ELO_BASE_RATING.toFixed(4);
  }
  return value.toFixed(4);
}

function splitTeamInput(rawValue = '') {
  const tokens = [];
  let buffer = '';
  let depth = 0;
  for (const ch of rawValue) {
    if (ch === '(') {
      if (depth === 0 && buffer.trim()) {
        tokens.push(buffer.trim());
        buffer = '';
      }
      depth += 1;
      buffer += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      buffer += ch;
    } else if (ch === ',' && depth === 0) {
      if (buffer.trim()) {
        tokens.push(buffer.trim());
      }
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  if (buffer.trim()) {
    tokens.push(buffer.trim());
  }
  return tokens;
}

function parseTeamGroups(rawValue = '') {
  const tokens = splitTeamInput(rawValue);
  const teamGroups = [];
  tokens.forEach((token, index) => {
    let content = token;
    if (token.startsWith('(') && token.endsWith(')')) {
      content = token.slice(1, -1);
    }
    const aliases = content.split(',').map(v => v.trim()).filter(Boolean);
    if (!aliases.length) {
      return;
    }
    const normalizedAliases = aliases
      .map(alias => normalizeName(alias))
      .filter(Boolean);
    const groupId = `team-group-${teamGroups.length}`;
    teamGroups.push({
      id: groupId,
      displayName: aliases[0],
      aliases,
      normalizedAliases
    });
  });
  return { teamGroups };
}

function normalizeSecondsValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num > 1e7 ? Math.round(num / 1000) : Math.round(num);
}

function normalizeTimestampValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num > 1e12 ? Math.round(num / 1000) : Math.round(num);
}

function resolveContestLength(rankData) {
  if (!rankData) return Infinity;
  const directSources = [
    rankData.length,
    rankData.duration,
    rankData.contestLength,
    rankData?.contest?.length,
    rankData?.contest?.duration
  ];
  for (const source of directSources) {
    const seconds = normalizeSecondsValue(source);
    if (seconds) return seconds;
  }

  const startCandidates = [
    rankData.startTime,
    rankData.begin,
    rankData.beginTime,
    rankData.start,
    rankData?.contest?.startTime,
    rankData?.contest?.begin
  ];
  const endCandidates = [
    rankData.endTime,
    rankData.finishTime,
    rankData.end,
    rankData?.contest?.endTime,
    rankData?.contest?.end
  ];

  const startSeconds = startCandidates
    .map(candidate => normalizeTimestampValue(candidate))
    .find(value => Number.isFinite(value));
  const endSeconds = endCandidates
    .map(candidate => normalizeTimestampValue(candidate))
    .find(value => Number.isFinite(value));

  if (startSeconds && endSeconds && endSeconds > startSeconds) {
    return normalizeSecondsValue(endSeconds - startSeconds) || Infinity;
  }

  return Infinity;
}

function buildRanklist(rankData) {
  // Always rebuild so we can filter upsolves consistently
  if (!rankData?.participants || !Array.isArray(rankData?.submissions)) {
    if (Array.isArray(rankData?.ranklist) && rankData.ranklist.length) {
      return rankData.ranklist;
    }
    return null;
  }

  const includeUpsolve = document.getElementById('includeUpsolve')?.checked || false;
  const contestLength = resolveContestLength(rankData);

  const teams = new Map();
  Object.entries(rankData.participants).forEach(([teamId, info]) => {
    const username = info?.[0] || '';
    const displayName = info?.[1] || username || `Team ${teamId}`;
    teams.set(Number(teamId), {
      teamId: Number(teamId),
      displayName,
      username,
      aliases: Array.from(new Set([
        displayName,
        username,
        displayName.replace(/_/g, ' '),
        username.replace(/_/g, ' ')
      ].filter(Boolean))),
      solved: 0,
      penalty: 0,
      submissions: 0,
      attempted: false,
      problems: new Map()
    });
  });

  const orderedSubs = rankData.submissions
    .map(entry => ({
      teamId: Number(entry[0]),
      problemId: entry[1],
      accepted: entry[2] === 1,
      time: entry[3] || 0
    }))
    .filter(sub => {
      // If not including upsolve, filter out submissions after contest end
      if (!includeUpsolve && contestLength !== Infinity) {
        return sub.time <= contestLength;
      }
      return true;
    })
    .sort((a, b) => a.time - b.time);

  orderedSubs.forEach(sub => {
    const team = teams.get(sub.teamId);
    if (!team) return;
    team.attempted = true;
    team.submissions += 1;
    let problemRecord = team.problems.get(sub.problemId);
    if (!problemRecord) {
      problemRecord = { wrong: 0, solved: false };
      team.problems.set(sub.problemId, problemRecord);
    }
    if (problemRecord.solved) return;
    if (sub.accepted) {
      problemRecord.solved = true;
      problemRecord.time = sub.time;
      team.solved += 1;
      team.penalty += sub.time + problemRecord.wrong * PENALTY_PER_WRONG;
    } else {
      problemRecord.wrong += 1;
    }
  });

  const ranked = Array.from(teams.values())
    .filter(team => team.attempted || team.solved)
    .sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      return (a.penalty || 0) - (b.penalty || 0);
    });

  let prevKey = null;
  let currentRank = 0;
  ranked.forEach((team, index) => {
    const key = `${team.solved}-${team.penalty}`;
    if (key !== prevKey) {
      currentRank = index + 1;
      prevKey = key;
    }
    team.rank = currentRank;
  });

  return ranked.map(team => {
    const displayPenalty = formatPenalty(team.penalty);
    return {
      team_id: team.teamId,
      team_name: team.displayName,
      rank: team.rank,
      solved: team.solved,
      penalty: team.penalty,
      penaltyDisplay: displayPenalty,
      time: displayPenalty,
      submissions: team.submissions,
      aliases: team.aliases
    };
  });
}

function collectInputs() {
  const contestInput = document.getElementById('contestInput');
  const teamInput = document.getElementById('teamInput');
  
  const invalidIds = [];
  const contestIds = (contestInput?.value || '')
    .split(',')
    .map(v => {
      const value = v.trim();
      if (!value) return null;
      // Check if it's a valid number
      if (!/^\d+$/.test(value)) {
        invalidIds.push(value);
        return null;
      }
      return value;
    })
    .filter(Boolean);
  
  const { teamGroups } = parseTeamGroups(teamInput?.value || '');
  
  return { contestIds, teamGroups, invalidIds };
}

async function ensureContestData(contestId, { forceRefetch = false } = {}) {
  if (!forceRefetch && contestCache.has(contestId)) {
    return contestCache.get(contestId);
  }

  const rankData = await fetchContestRank(contestId);
  if (!rankData || rankData.error) {
    return { error: rankData?.error || 'Unknown error' };
  }

  const ranklist = buildRanklist(rankData);
  if (!ranklist) {
    return { error: 'No ranklist data was returned. VJudge may be throttling anonymous API calls.' };
  }

  const payload = {
    ranklist,
    participants: rankData.participants || {},
    fetchedAt: Date.now()
  };
  contestCache.set(contestId, payload);
  return payload;
}

function renderTeamsForContest(contestDiv, contestData, teamGroups) {
  const rows = [];
  
  for (const group of teamGroups) {
    const match = findBestGroupMatch(group, contestData.ranklist, contestData.participants);
    if (match?.entry) {
      const entry = match.entry;
      const contestRank = entry.rank ?? '—';
      const numericRank = Number(contestRank);
      const rankValue = Number.isFinite(numericRank) ? numericRank : 999999;
      rows.push({
        team: group.displayName,
        alias: match.alias,
        contestRank,
        solved: entry.solved ?? '—',
        penalty: entry.penaltyDisplay || entry.penalty || entry.time || '—',
        status: 'found',
        statusText: 'Found',
        rankValue
      });
    } else if (match?.participant) {
      rows.push({
        team: group.displayName,
        alias: match.alias,
        contestRank: '—',
        solved: '—',
        penalty: '—',
        status: 'registered',
        statusText: 'Registered',
        rankValue: 999999
      });
    } else {
      rows.push({
        team: group.displayName,
        alias: null,
        contestRank: '—',
        solved: '—',
        penalty: '—',
        status: 'not-found',
        statusText: 'Not Found',
        rankValue: 999999
      });
    }
  }
  
  // Sort teams by their contest ranking (best placements first)
  rows.sort((a, b) => a.rankValue - b.rankValue);

  let prevKey = null;
  let currentRank = 0;
  rows.forEach((row, index) => {
    const key = row.rankValue;
    if (key !== prevKey) {
      currentRank = index + 1;
      prevKey = key;
    }
    row.displayRank = currentRank;
  });

  if (rows.length === 0) return;

  const tableHTML = `
    <table class="contest-table">
      <thead>
        <tr>
          <th class="rank-col">Rank</th>
          <th class="team-col">Team Name</th>
          <th class="solved-col">Solved</th>
          <th class="penalty-col">Penalty</th>
          <th class="status-col">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td class="rank-col">${row.displayRank}</td>
            <td class="team-col">
              <div class="team-name">${row.team}</div>
              ${row.alias ? `<div class="team-meta">Matched as: ${row.alias}</div>` : ''}
              ${row.contestRank !== '—' ? `<div class="team-meta">Contest rank: ${row.contestRank}</div>` : ''}
            </td>
            <td class="solved-col">${row.solved}</td>
            <td class="penalty-col">${row.penalty}</td>
            <td class="status-col"><span class="status-badge status-${row.status}">${row.statusText}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  contestDiv.innerHTML += tableHTML;
}

function prepareAggregateView(contestIds) {
  const uniqueIds = Array.from(new Set(contestIds));

  const previousSelection = new Set(selectionState.selected);
  selectionState.contestIds = uniqueIds;

  if (selectionState.mode === 'all') {
    selectionState.selected = new Set(uniqueIds);
  } else {
    const filtered = uniqueIds.filter(id => previousSelection.has(id));
    selectionState.selected = new Set(filtered);
    if (!selectionState.selected.size && uniqueIds.length) {
      selectionState.selected.add(uniqueIds[0]);
    }
  }

  updateContestChips(uniqueIds);
}

function refreshAggregateRanking() {
  const aggregateContainer = document.getElementById('aggregateResults');
  if (!aggregateContainer) return;

  const { teamGroups } = collectInputs();
  if (!teamGroups.length) {
    aggregateContainer.innerHTML = '<div class="aggregate-empty">Add at least one team to view the combined ranking.</div>';
    return;
  }

  const contestIds = selectionState.mode === 'all'
    ? selectionState.contestIds
    : Array.from(selectionState.selected);

  if (!contestIds.length) {
    aggregateContainer.innerHTML = '<div class="aggregate-empty">Select at least one contest to merge.</div>';
    return;
  }

  const missingData = contestIds.some(id => !contestCache.has(id));
  if (missingData) {
    aggregateContainer.innerHTML = '<div class="aggregate-empty">Fetching contest data...</div>';
    return;
  }

  const rows = buildAggregateRanking(contestIds, teamGroups);
  if (!rows.length) {
    aggregateContainer.innerHTML = '<div class="aggregate-empty">Teams were not found in the selected contests.</div>';
    return;
  }

  const tbody = rows.map(row => `
    <tr>
      <td>${row.rank}</td>
      <td>
        <div class="team-name">${row.displayName}</div>
        <div class="team-meta">${row.appearances} contest${row.appearances === 1 ? '' : 's'} with results</div>
      </td>
      <td>${row.appearances} / ${contestIds.length}</td>
      <td>${row.solved}</td>
      <td>${row.penaltyDisplay}</td>
    </tr>
  `).join('');

  aggregateContainer.innerHTML = `
    <table class="aggregate-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>Contests</th>
          <th>Solved</th>
          <th>Penalty</th>
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

function normalizePenaltyValue(entry) {
  if (!entry) return 0;
  if (typeof entry.penalty === 'number') return entry.penalty;
  if (typeof entry.time === 'number') return entry.time;
  const numericPenalty = Number(entry.penalty);
  if (!Number.isNaN(numericPenalty)) return numericPenalty;
  return 0;
}

function buildAggregateRanking(contestIds, teamGroups) {
  const statsByTeam = new Map();
  teamGroups.forEach(group => {
    statsByTeam.set(group.id, {
      id: group.id,
      displayName: group.displayName,
      solved: 0,
      penalty: 0,
      appearances: 0
    });
  });

  for (const contestId of contestIds) {
    const contestData = contestCache.get(contestId);
    if (!contestData) continue;
    for (const group of teamGroups) {
      const stats = statsByTeam.get(group.id);
      if (!stats) continue;
      const match = findBestGroupMatch(group, contestData.ranklist, contestData.participants);
      if (match?.entry) {
        stats.appearances += 1;
        stats.solved += Number(match.entry.solved) || 0;
        stats.penalty += normalizePenaltyValue(match.entry);
      }
    }
  }

  const rows = Array.from(statsByTeam.values())
    .map(row => ({
      ...row,
      penaltyDisplay: formatPenalty(row.penalty)
    }))
    .sort((a, b) => {
      if (b.solved !== a.solved) return b.solved - a.solved;
      if (a.penalty !== b.penalty) return a.penalty - b.penalty;
      return a.displayName.localeCompare(b.displayName);
    });

  let currentRank = 0;
  let prevKey = null;
  rows.forEach((row, index) => {
    const key = `${row.solved}-${row.penalty}`;
    if (key !== prevKey) {
      currentRank = index + 1;
      prevKey = key;
    }
    row.rank = currentRank;
  });

  return rows;
}

function refreshEloStandings() {
  const eloContainer = document.getElementById('eloResults');
  if (!eloContainer) return;

  const { teamGroups } = collectInputs();
  if (!teamGroups.length) {
    eloContainer.innerHTML = '<div class="elo-empty">Add at least one team to compute Elo standings.</div>';
    return;
  }

  const contestIds = selectionState.mode === 'all'
    ? selectionState.contestIds
    : Array.from(selectionState.selected);

  if (!contestIds.length) {
    eloContainer.innerHTML = '<div class="elo-empty">Select contests to include in the Elo standings.</div>';
    return;
  }

  const missingData = contestIds.some(id => !contestCache.has(id));
  if (missingData) {
    eloContainer.innerHTML = '<div class="elo-empty">Fetching contest data...</div>';
    return;
  }

  const rows = buildEloStandings(contestIds, teamGroups, selectionState.eloMode || 'normal');
  if (!rows.length) {
    eloContainer.innerHTML = '<div class="elo-empty">No completed contest placements available yet.</div>';
    return;
  }

  const tbody = rows.map(row => `
    <tr>
      <td>${row.rank}</td>
      <td>${row.name}</td>
      <td class="rating-col">${row.ratingDisplay}</td>
      <td>${row.contests}</td>
      <td class="record-col">${row.wins}-${row.losses}-${row.draws}</td>
    </tr>
  `).join('');

  eloContainer.innerHTML = `
    <table class="rating-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th class="rating-col">Rating</th>
          <th>Contests</th>
          <th class="record-col">W-L-D</th>
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

function buildEloStandings(contestIds, teamGroups, mode = 'normal') {
  if (!contestIds.length || !teamGroups.length) {
    return [];
  }

  const eloMode = mode || 'normal';
  const ratingState = new Map();

  const ensureTeam = (group) => {
    if (!group) return null;
    let record = ratingState.get(group.id);
    if (!record) {
      record = {
        id: group.id,
        name: group.displayName,
        rating: ELO_BASE_RATING,
        wins: 0,
        losses: 0,
        draws: 0,
        contests: 0
      };
      ratingState.set(group.id, record);
    }
    return record;
  };

  teamGroups.forEach(group => ensureTeam(group));

  for (const contestId of contestIds) {
    const contestData = contestCache.get(contestId);
    if (!contestData?.ranklist) continue;

    const condensed = new Map();
    for (const group of teamGroups) {
      const match = findBestGroupMatch(group, contestData.ranklist, contestData.participants);
      const rankValue = Number(match?.entry?.rank);
      if (!Number.isFinite(rankValue)) continue;
      const existing = condensed.get(group.id);
      if (!existing || rankValue < existing.rank) {
        condensed.set(group.id, { group, rank: rankValue });
      }
    }

    if (!condensed.size && eloMode !== 'zero-participation') {
      continue;
    }

    let ordered = Array.from(condensed.values()).sort((a, b) => a.rank - b.rank);

    if (!ordered.length && eloMode === 'zero-participation') {
      ordered = teamGroups.map(group => ({ group, rank: Number.MAX_SAFE_INTEGER }));
    }

    if (eloMode === 'zero-participation') {
      const present = new Set(ordered.map(item => item.group.id));
      teamGroups.forEach(group => {
        if (!present.has(group.id)) {
          ordered.push({ group, rank: Number.MAX_SAFE_INTEGER });
          present.add(group.id);
        }
      });
      ordered = ordered.sort((a, b) => a.rank - b.rank);
    }

    const seenThisContest = new Set();

    ordered.forEach(entry => {
      const record = ensureTeam(entry.group);
      if (record && !seenThisContest.has(record.id)) {
        record.contests += 1;
        seenThisContest.add(record.id);
      }
    });

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const teamA = ensureTeam(ordered[i].group);
        const teamB = ensureTeam(ordered[j].group);
        if (!teamA || !teamB) continue;
        const expectedA = 1 / (1 + Math.pow(10, (teamB.rating - teamA.rating) / 400));
        const expectedB = 1 - expectedA;
        let scoreA = 1;
        let scoreB = 0;

        if (ordered[i].rank === ordered[j].rank) {
          scoreA = 0.5;
          scoreB = 0.5;
          teamA.draws += 1;
          teamB.draws += 1;
        } else {
          teamA.wins += 1;
          teamB.losses += 1;
        }

        let deltaA = ELO_K_FACTOR * (scoreA - expectedA);
        let deltaB = ELO_K_FACTOR * (scoreB - expectedB);

        if (eloMode === 'gain-only') {
          if (deltaA < 0) deltaA = 0;
          if (deltaB < 0) deltaB = 0;
        }

        teamA.rating += deltaA;
        teamB.rating += deltaB;
      }
    }
  }

  return Array.from(ratingState.values())
    .map(record => ({
      ...record,
      ratingDisplay: formatRating(record.rating)
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.name.localeCompare(b.name);
    })
    .map((record, index) => ({
      ...record,
      rank: index + 1
    }));
}

async function renderResults({ forceRefetch = false, useCacheOnly = false, showSpinner = false, silentErrors = false } = {}) {
  const container = document.getElementById('results');
  const { contestIds, teamGroups } = collectInputs();

  prepareAggregateView(contestIds);
  refreshAggregateRanking();
  refreshEloStandings();

  if (!contestIds.length) {
    if (!silentErrors) {
      container.innerHTML = '<div class="error">Please enter at least one contest ID.</div>';
    }
    return false;
  }

  if (!teamGroups.length) {
    // Don't clear contests, just return
    return false;
  }

  if (useCacheOnly) {
    const missingCache = contestIds.some(id => !contestCache.has(id));
    if (missingCache) {
      return false;
    }
  }

  if (showSpinner) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading contest data...</p></div>';
  }

  const fragment = document.createDocumentFragment();
  let rendered = false;

  for (const contestId of contestIds) {
    let contestDiv = document.getElementById(`contest-${contestId}`);
    
    if (!contestDiv) {
      contestDiv = document.createElement('div');
      contestDiv.className = 'contest';
      contestDiv.id = `contest-${contestId}`;
      fragment.appendChild(contestDiv);
    } else {
      // Clear existing content to re-render with teams
      contestDiv.innerHTML = '';
    }
    
    // Get contest name from cache or use ID
    const contestName = contestInfoCache.get(contestId) || `Contest ${contestId}`;
    const contestUrl = `https://vjudge.net/contest/${contestId}`;
    contestDiv.innerHTML = `<h2><a href="${contestUrl}" target="_blank" rel="noopener noreferrer">${contestName}</a></h2>`;

    let contestData;
    if (useCacheOnly) {
      contestData = contestCache.get(contestId);
    } else {
      contestData = await ensureContestData(contestId, { forceRefetch });
    }

    if (!contestData || contestData.error) {
      const errorMsg = contestData?.error || 'Unknown error';
      contestDiv.innerHTML += `<div class="error">
        ${errorMsg}
      </div>`;
    } else {
      rendered = true;
      renderTeamsForContest(contestDiv, contestData, teamGroups);
    }

    if (fragment.contains(contestDiv)) {
      // contestDiv is new, keep it in fragment
    } else {
      // contestDiv already in DOM, already updated
    }
  }

  if (fragment.childNodes.length > 0) {
    container.appendChild(fragment);
  }
  refreshAggregateRanking();
  refreshEloStandings();
  return rendered;
}

function getParticipantAliases(info = []) {
  const username = info?.[0] || '';
  const displayName = info?.[1] || '';
  const extras = [username, displayName, username.replace(/_/g, ' '), displayName.replace(/_/g, ' ')];
  return extras.filter(Boolean);
}

function findTeamRecord(teamName, ranklist, participants = {}) {
  const target = normalizeName(teamName);
  if (!target) return null;

  const rankMatch = ranklist?.find(entry => {
    const aliases = [entry.team_name, entry.teamName, ...(entry.aliases || [])].filter(Boolean);
    return aliases.some(alias => normalizeName(alias) === target);
  });

  if (rankMatch) {
    return { entry: rankMatch };
  }

  for (const [teamId, info] of Object.entries(participants)) {
    const aliases = getParticipantAliases(info);
    if (aliases.some(alias => normalizeName(alias) === target)) {
      return { participant: { id: Number(teamId), info } };
    }
  }

  return null;
}

function findBestGroupMatch(teamGroup, ranklist, participants = {}) {
  if (!teamGroup) return null;
  let bestEntry = null;
  let bestAlias = null;
  let fallbackParticipant = null;
  let fallbackAlias = null;

  for (const alias of teamGroup.aliases) {
    const lookup = findTeamRecord(alias, ranklist, participants);
    if (lookup?.entry) {
      const entry = lookup.entry;
      const entryRank = Number(entry.rank);
      const currentBestRank = bestEntry ? Number(bestEntry.rank) : Infinity;
      if (!bestEntry || (Number.isFinite(entryRank) && entryRank < currentBestRank)) {
        bestEntry = entry;
        bestAlias = alias;
      }
    } else if (lookup?.participant && !fallbackParticipant) {
      fallbackParticipant = lookup.participant;
      fallbackAlias = alias;
    }
  }

  return {
    entry: bestEntry,
    participant: fallbackParticipant,
    alias: bestAlias || fallbackAlias || null
  };
}

// Initialize on page load
registerInputListener('contestInput');
registerInputListener('teamInput');
initAggregateControls();
initEloModeControls();

// Listen to upsolve checkbox changes
const upsolveCheckbox = document.getElementById('includeUpsolve');
if (upsolveCheckbox) {
  upsolveCheckbox.addEventListener('change', () => {
    // Clear cache to force re-calculation
    contestCache.clear();
    scheduleAutoRefresh();
  });
}

console.log('VJudge Contest Checker loaded successfully!');
console.log('Ready to fetch contest data directly from VJudge API');
