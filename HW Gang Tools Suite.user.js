// ==UserScript==
// @name         HW Gang Tools Suite
// @namespace    https://www.hobowars.com/
// @version      2.0
// @description  Configurable gang administration tools for incentive payouts, loan reconciliation, member-stat deltas, and Gangsters Paradise Awake exports.
// @homepageURL  https://github.com/lvl11evelyn/hw7-gang-tools/blob/main/README.md
// @updateURL    https://github.com/lvl11evelyn/hw7-gang-tools/raw/refs/heads/main/HW%20Gang%20Tools%20Suite.user.js
// @downloadURL  https://github.com/lvl11evelyn/hw7-gang-tools/raw/refs/heads/main/HW%20Gang%20Tools%20Suite.user.js
// @match        *://www.hobowars.com/game/game.php*
// @match        *://hobowars.com/game/game.php*
// @run-at       document-end
// @grant        GM_info
// ==/UserScript==

/*
 * Shared HoboWars settings-provider coordinator.
 *
 * Every participating userscript carries this small coordinator. Providers
 * communicate only through same-origin DOM markers/events and localStorage;
 * no userscript sandbox needs a reference to another script's functions.
 */
function HW_registerSharedSettingsProvider(panel, provider) {
    'use strict';

    if (!(panel instanceof HTMLElement) || !provider) return;

    const ACTIVE_KEY = 'hw.sharedSettings.activeProvider.v1';
    const REGISTER_EVENT = 'hw:settings-provider-registered';
    const COORDINATOR_ATTR = 'data-hw-settings-coordinator';
    const PROVIDER_SELECTOR = '[data-hw-settings-provider]';
    const TAB_WIDTH = 25;

    panel.dataset.hwSettingsProvider = String(provider.id || '');
    panel.dataset.hwSettingsLabel = String(provider.label || provider.id || '');
    panel.dataset.hwSettingsOrder = String(Number(provider.order) || 999);
    panel.hidden = false;

    if (!document.getElementById('hw-shared-settings-styles')) {
        const style = document.createElement('style');
        style.id = 'hw-shared-settings-styles';
        style.textContent = `
            .hw-settings-shared-shell {
                --hw-settings-tab-width: ${TAB_WIDTH}px;
                position: relative;
                float: right;
                display: grid;
                grid-template-columns: minmax(0, 1fr) var(--hw-settings-tab-width);
                align-items: start;
                width: 472px;
                max-width: calc(100% - 307px);
                margin: 0 0 18px 5px;
                box-sizing: border-box;
                color: #111;
                font-family: Arial, sans-serif;
                font-size: 13px;
            }
            .hw-settings-shared-shell::after {
                content: '';
                position: absolute;
                z-index: 2;
                top: 0;
                right: calc(var(--hw-settings-tab-width) - 1px);
                bottom: 0;
                width: 1px;
                background: #c9c9c9;
                pointer-events: none;
            }
            .hw-settings-shared-body {
                position: relative;
                z-index: 1;
                min-width: 0;
            }
            .hw-settings-shared-body > [data-hw-settings-provider] {
                float: none !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                border-radius: 5px 0 5px 5px !important;
                min-height: 450px;
            }
            .hw-settings-shared-body > [data-hw-settings-provider][hidden] {
                display: none !important;
            }
            .hw-settings-shared-tabs {
                position: relative;
                z-index: 0;
                display: flex;
                flex-direction: column;
                align-items: stretch;
                min-width: 0;
                gap: 5px;
                padding-top: 16px;
            }
            .hw-settings-tab {
                position: relative;
                z-index: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                height: 100px;
                min-height: 100px;
                margin: 0;
                padding: 7px 5px;
                box-sizing: border-box;
                border: 1px solid #7f7f7f;
                border-radius: 0 10px 10px 0;
                background: #c3c3c3;
                color: #111;
                font: inherit;
                text-align: center;
                text-decoration: underline;
                writing-mode: vertical-rl;
                text-orientation: mixed;
                cursor: pointer;
            }
            .hw-settings-tab:not(.hw-settings-tab-active):hover {
                border-color: #007a2d;
                background: #f4fff8;
            }
            .hw-settings-tab.hw-settings-tab-active {
                z-index: 3;
                border: 1px solid #c9c9c9;
                border-left-color: #f3f3f3;
                background: #f3f3f3;
                font-weight: bold;
                text-decoration: none;
                cursor: default;
            }
        `;
        document.head.appendChild(style);
    }

    const readProviders = () => {
        const seen = new Set();
        return [...document.querySelectorAll(PROVIDER_SELECTOR)]
            .filter(node => {
                const id = node.dataset.hwSettingsProvider || '';
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((a, b) => {
                const orderDelta =
                    (Number(a.dataset.hwSettingsOrder) || 999) -
                    (Number(b.dataset.hwSettingsOrder) || 999);
                return orderDelta ||
                    (a.dataset.hwSettingsProvider || '').localeCompare(
                        b.dataset.hwSettingsProvider || ''
                    );
            });
    };

    const syncShellGeometry = shell => {
        if (!shell) return;
        shell.classList.remove('hw-settings-shared-stacked');
    };

    const coordinate = () => {
        const providers = readProviders();
        let shell = document.querySelector('.hw-settings-shared-shell');

        if (providers.length < 2) {
            if (shell) {
                const parent = shell.parentNode;
                const reference = shell;
                for (const providerPanel of providers) {
                    parent?.insertBefore(providerPanel, reference);
                    providerPanel.hidden = false;
                    providerPanel.style.removeProperty('display');
                }
                shell.remove();
            } else if (providers[0]) {
                providers[0].hidden = false;
                providers[0].style.removeProperty('display');
            }
            return;
        }

        if (!shell) {
            const anchor = providers[0];
            shell = document.createElement('section');
            shell.className = 'hw-settings-shared-shell';
            shell.setAttribute('aria-label', 'HoboWars settings');

            const body = document.createElement('div');
            body.className = 'hw-settings-shared-body';

            const tabs = document.createElement('div');
            tabs.className = 'hw-settings-shared-tabs';
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', 'Settings providers');
            tabs.setAttribute('aria-orientation', 'vertical');

            shell.append(body, tabs);
            anchor.parentNode?.insertBefore(shell, anchor);
        }

        const body = shell.querySelector('.hw-settings-shared-body');
        const tabs = shell.querySelector('.hw-settings-shared-tabs');
        if (!body || !tabs) return;

        for (const providerPanel of providers) body.appendChild(providerPanel);

        let activeId = '';
        try {
            activeId = localStorage.getItem(ACTIVE_KEY) || '';
        } catch {
            activeId = '';
        }

        if (!providers.some(item => item.dataset.hwSettingsProvider === activeId)) {
            activeId = providers[0].dataset.hwSettingsProvider;
            try {
                localStorage.setItem(ACTIVE_KEY, activeId);
            } catch {
                // Deterministic in-memory fallback still applies.
            }
        }

        tabs.replaceChildren();

        for (const providerPanel of providers) {
            const id = providerPanel.dataset.hwSettingsProvider;
            const label = providerPanel.dataset.hwSettingsLabel || id;
            const active = id === activeId;

            providerPanel.hidden = !active;
            providerPanel.style.setProperty(
                'display',
                active ? 'block' : 'none',
                'important'
            );
            providerPanel.setAttribute('role', 'tabpanel');
            providerPanel.setAttribute('aria-hidden', String(!active));

            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'hw-settings-tab';
            tab.classList.toggle('hw-settings-tab-active', active);
            tab.textContent = label;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(active));

            tab.addEventListener('click', () => {
                try {
                    localStorage.setItem(ACTIVE_KEY, id);
                } catch {
                    // The current click can still be reflected in this page.
                }
                coordinate();
            });

            tabs.appendChild(tab);
        }

        syncShellGeometry(shell);
    };

    const root = document.documentElement;
    if (!root.hasAttribute(COORDINATOR_ATTR)) {
        root.setAttribute(COORDINATOR_ATTR, `${provider.id}:${Date.now()}`);
        document.addEventListener(REGISTER_EVENT, coordinate);
        window.addEventListener('resize', () => {
            syncShellGeometry(document.querySelector('.hw-settings-shared-shell'));
        }, { passive: true });
    }

    coordinate();
    document.dispatchEvent(new Event(REGISTER_EVENT));
}

const HWGT_SETTINGS_KEY = 'hwGangTools.moduleStates.v1';
const HWGT_MODULES = Object.freeze([
    ['gila', 'Gang Incentives and Loans Aid', 'v1.5'],
    ['gp-exporter', 'GP Awake Exporter', 'v1.5'],
    ['member-stats', 'Gang Member Stat Tracker', 'v1.2']
]);

const HWGT_MEMBER_TRACKER_KEY = 'hwgt_member_stat_tracker_v2';
const HWGT_MEMBER_CLASSIFICATIONS = Object.freeze({
    warChamber: 'War Chamber',
    juniorWarChamber: 'Junior War Chamber',
    leadershipCouncil: 'Leadership Council',
    gangStaff: 'Gang Staff',
    gangMember: 'Gang Member',
    formerMember: 'Former Member',
    whitelist: 'Whitelist',
    active: 'Active',
    inactive: 'Inactive'
});
const HWGT_MEMBER_GROUPS = Object.freeze({
    main: {
        label: 'Main',
        stats: Object.freeze({
            level: ['ts_level', 'Level'],
            age: ['ts_age', 'Age'],
            lastActive: ['ts_la', 'Last Active'],
            chamber: ['ts_chamber', 'Chamber'],
            awakeUsed: ['ts_tired', 'Awake Used']
        })
    },
    battle: {
        label: 'Battle Stats',
        stats: Object.freeze({
            speed: ['ts_speed', 'Speed'],
            power: ['ts_power', 'Power'],
            strength: ['ts_strength', 'Strength'],
            tbs: ['ts_tbs', 'TBS'],
            life: ['ts_life', 'Life']
        })
    },
    other: {
        label: 'Other Stats',
        stats: Object.freeze({
            begging: ['ts_beg', 'Beg'],
            intelligence: ['ts_intel', 'Intel'],
            drinking: ['ts_drinking', 'Drinking'],
            mining: ['ts_mining', 'Mining']
        })
    },
    hall: {
        label: 'Hall of Fame',
        stats: Object.freeze({
            experience: ['ts_exp', 'Exp'],
            beggingIncome: ['ts_beg_income', 'Beg Income'],
            cash: ['ts_cash', 'Cash'],
            points: ['ts_points', 'Points'],
            tokens: ['ts_tokens', 'Tokens'],
            donatorPoints: ['ts_dps', 'DPs']
        })
    }
});

function HWGT_defaultMemberTrackerSettings() {
    const today = new Date();
    const defaultAnchor = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const schedule = (frequency, options = {}) => ({
        frequency,
        weekday: options.weekday ?? 1,
        monthDay: options.monthDay ?? 1,
        time: options.time || '00:00',
        intervalDays: options.intervalDays ?? 14,
        anchorDate: options.anchorDate || defaultAnchor,
        timezone: options.timezone || 'local'
    });

    return {
        groups: {
            main: { enabled: true, schedule: schedule('monthly', { monthDay: 1, time: '08:00' }), retention: { value: 6, unit: 'months' } },
            battle: { enabled: true, schedule: schedule('weekly', { weekday: 1, time: '12:00' }), retention: { value: 6, unit: 'months' } },
            other: { enabled: true, schedule: schedule('monthly', { monthDay: 1, time: '08:00' }), retention: { value: 6, unit: 'months' } },
            hall: { enabled: true, schedule: schedule('monthly', { monthDay: 1, time: '08:00' }), retention: { value: 6, unit: 'months' } }
        },
        exceptions: {},
        exceptionMode: 'invert',
        export: { format: 'text' }
    };
}

function HWGT_mergeMemberTrackerSettings(value) {
    const defaults = HWGT_defaultMemberTrackerSettings();
    const input = value && typeof value === 'object' ? value : {};

    Object.keys(HWGT_MEMBER_GROUPS).forEach(groupId => {
        const source = input.groups?.[groupId];
        if (!source || typeof source !== 'object') return;
        defaults.groups[groupId].enabled = source.enabled !== false;
        Object.assign(defaults.groups[groupId].schedule, source.schedule || {});
        if (!['local', 'server'].includes(defaults.groups[groupId].schedule.timezone)) {
            defaults.groups[groupId].schedule.timezone =
                defaults.groups[groupId].schedule.timezone === 'utc' ? 'server' : 'local';
        }
        Object.assign(defaults.groups[groupId].retention, source.retention || {});
    });

    const sourceExceptions = input.exceptions && typeof input.exceptions === 'object'
        ? input.exceptions
        : {};
    defaults.exceptions = {};
    Object.entries(sourceExceptions).forEach(([memberId, groups]) => {
        if (!groups || typeof groups !== 'object') return;
        Object.entries(groups).forEach(([groupId, value]) => {
            if (!Object.hasOwn(HWGT_MEMBER_GROUPS, groupId)) return;
            const isException = input.exceptionMode === 'invert'
                ? value === true
                : typeof value === 'boolean';
            if (!isException) return;
            if (!defaults.exceptions[memberId]) defaults.exceptions[memberId] = {};
            defaults.exceptions[memberId][groupId] = true;
        });
    });
    defaults.exceptionMode = 'invert';
    Object.assign(defaults.export, input.export || {});
    if (!['markdown', 'text', 'json'].includes(defaults.export.format)) {
        defaults.export.format = 'text';
    }
    Object.values(defaults.groups).forEach(group => {
        const limits = { days: 7, weeks: 52, months: 24 };
        if (!Object.hasOwn(limits, group.retention.unit)) group.retention.unit = 'months';
        group.retention.value = Math.min(
            limits[group.retention.unit],
            Math.max(1, Number(group.retention.value) || 1)
        );
    });
    return defaults;
}

function HWGT_loadMemberTrackerData() {
    let parsed = {};
    try {
        parsed = JSON.parse(localStorage.getItem(HWGT_MEMBER_TRACKER_KEY) || '{}');
    } catch (_) {
        parsed = {};
    }

    return {
        schema: 3,
        settings: HWGT_mergeMemberTrackerSettings(parsed.settings),
        catalog: {
            members: parsed.catalog?.members && typeof parsed.catalog.members === 'object'
                ? parsed.catalog.members
                : {}
        },
        sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
        epochs: Array.isArray(parsed.epochs) ? parsed.epochs : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        visits: Array.isArray(parsed.visits) ? parsed.visits : []
    };
}

function HWGT_saveMemberTrackerData(data) {
    try {
        localStorage.setItem(HWGT_MEMBER_TRACKER_KEY, JSON.stringify(data));
        return true;
    } catch (error) {
        const newestByGroup = new Map();
        data.epochs.forEach(epoch => {
            if (!newestByGroup.has(epoch.group) || newestByGroup.get(epoch.group).boundaryAt < epoch.boundaryAt) {
                newestByGroup.set(epoch.group, epoch);
            }
        });
        const protectedIds = new Set(Array.from(newestByGroup.values()).map(epoch => epoch.id));
        const removable = data.epochs
            .filter(epoch => !protectedIds.has(epoch.id))
            .sort((a, b) => a.boundaryAt - b.boundaryAt);

        while (removable.length) {
            const expired = removable.shift();
            data.epochs = data.epochs.filter(epoch => epoch.id !== expired.id);
            data.events = data.events.filter(event => event.epochId !== expired.id);
            data.visits = data.visits.filter(visit => visit.epochId !== expired.id);
            try {
                localStorage.setItem(HWGT_MEMBER_TRACKER_KEY, JSON.stringify(data));
                console.warn('HW Gang Member Stat Tracker: storage was full; the oldest retained epoch was removed.');
                return true;
            } catch (_) {
                // Continue removing this component's oldest epochs only.
            }
        }

        console.error('HW Gang Member Stat Tracker: the newest records could not be saved.', error);
        return false;
    }
}

function HWGT_updateMemberTrackerSettings(mutator) {
    const data = HWGT_loadMemberTrackerData();
    mutator(data.settings, data);
    HWGT_saveMemberTrackerData(data);
    return data;
}

function HWGT_retentionMilliseconds(retention) {
    const value = Math.max(1, Number(retention?.value) || 1);
    const unit = retention?.unit || 'months';
    const day = 86_400_000;
    if (unit === 'days') return value * day;
    if (unit === 'weeks') return value * 7 * day;
    return value * 30.4375 * day;
}

function HWGT_scheduleBoundary(schedule, nowMs = Date.now()) {
    const serverTime = schedule?.timezone === 'server';
    const serverOffsetMs = 10 * 60 * 60 * 1000;
    const now = new Date(serverTime ? nowMs + serverOffsetMs : nowMs);
    const [hour, minute] = String(schedule?.time || '00:00')
        .split(':')
        .map(value => Number(value) || 0);
    const make = (year, month, day) => serverTime
        ? Date.UTC(year, month, day, hour, minute, 0, 0) - serverOffsetMs
        : new Date(year, month, day, hour, minute, 0, 0).getTime();
    const parts = date => serverTime
        ? [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCDay()]
        : [date.getFullYear(), date.getMonth(), date.getDate(), date.getDay()];
    const [year, month, day, weekday] = parts(now);
    const frequency = schedule?.frequency || 'weekly';

    if (frequency === 'daily') {
        let boundary = make(year, month, day);
        if (boundary > nowMs) boundary -= 86_400_000;
        return boundary;
    }

    if (frequency === 'weekly') {
        const targetDay = Math.min(6, Math.max(0, Number(schedule?.weekday) || 0));
        let offset = (weekday - targetDay + 7) % 7;
        let boundary = make(year, month, day - offset);
        if (boundary > nowMs) boundary = make(year, month, day - offset - 7);
        return boundary;
    }

    if (frequency === 'monthly') {
        const requestedDay = Math.min(31, Math.max(1, Number(schedule?.monthDay) || 1));
        const daysInMonth = (y, m) => serverTime
            ? new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
            : new Date(y, m + 1, 0).getDate();
        let targetYear = year;
        let targetMonth = month;
        let targetDay = Math.min(requestedDay, daysInMonth(targetYear, targetMonth));
        let boundary = make(targetYear, targetMonth, targetDay);
        if (boundary > nowMs) {
            targetMonth--;
            if (targetMonth < 0) {
                targetMonth = 11;
                targetYear--;
            }
            targetDay = Math.min(requestedDay, daysInMonth(targetYear, targetMonth));
            boundary = make(targetYear, targetMonth, targetDay);
        }
        return boundary;
    }

    const intervalDays = frequency === 'biweekly'
        ? 14
        : Math.min(3650, Math.max(1, Number(schedule?.intervalDays) || 1));
    const anchorMatch = String(schedule?.anchorDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const anchor = anchorMatch
        ? make(Number(anchorMatch[1]), Number(anchorMatch[2]) - 1, Number(anchorMatch[3]))
        : make(year, month, day);
    const intervalMs = intervalDays * 86_400_000;
    if (anchor > nowMs) return anchor - Math.ceil((anchor - nowMs) / intervalMs) * intervalMs;
    return anchor + Math.floor((nowMs - anchor) / intervalMs) * intervalMs;
}

function HWGT_effectiveMemberTracking(settings, memberId, groupId) {
    const defaultState = settings.groups[groupId]?.enabled !== false;
    const excepted = settings.exceptions?.[memberId]?.[groupId] === true;
    return excepted ? !defaultState : defaultState;
}

function HWGT_memberIsExcepted(settings, memberId, groupId) {
    return settings.exceptions?.[memberId]?.[groupId] === true;
}

function HWGT_memberHasClassification(data, memberId, classification) {
    if (!classification) return true;
    return data.catalog.members?.[memberId]?.classifications?.[classification] === true;
}

function HWGT_parseTrackedNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[$,\s]/g, '');
    return /^[-+]?\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

function HWGT_scheduleDateParts(schedule, nowMs = Date.now()) {
    const date = new Date(schedule?.timezone === 'server' ? nowMs + 36_000_000 : nowMs);
    return schedule?.timezone === 'server'
        ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
        : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function HWGT_compactAnchorDate(value) {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${match[1]}/${match[2]}` : '';
}

function HWGT_resolveAnchorDate(value, previousValue, schedule, nowMs = Date.now()) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return previousValue;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const [currentYear, currentMonth] = HWGT_scheduleDateParts(schedule, nowMs);
    let year = currentYear;
    if (currentMonth === 12 && month === 1) year++;
    if (currentMonth === 1 && month === 12) year--;
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        month < 1 || month > 12 || day < 1 ||
        candidate.getUTCFullYear() !== year ||
        candidate.getUTCMonth() !== month - 1 ||
        candidate.getUTCDate() !== day
    ) return previousValue;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function HWGT_snapshotRaw(member, statId) {
    if (member?.rawValues && Object.hasOwn(member.rawValues, statId)) return member.rawValues[statId];
    return member?.values?.[statId] ?? null;
}

function HWGT_exportTimestamp(value, timezone = 'local') {
    const date = new Date(timezone === 'server' ? Number(value) + 36_000_000 : Number(value));
    const read = method => timezone === 'server'
        ? date[`getUTC${method}`]()
        : date[`get${method}`]();
    return `${String(read('Hours')).padStart(2, '0')}:${String(read('Minutes')).padStart(2, '0')} ` +
        `${String(read('Month') + 1).padStart(2, '0')}/${String(read('Date')).padStart(2, '0')}/${read('FullYear')}`;
}

function HWGT_exportDelta(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const formatted = HWGT_groupExportNumber(number);
    return number > 0 ? `+${formatted}` : formatted;
}

function HWGT_groupExportNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const text = String(value).trim();
    const match = text.replace(/,/g, '').match(/^([+-]?)(\d+)(\.\d+)?$/);
    if (!match) return text;
    const groupedInteger = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${match[1]}${groupedInteger}${match[3] || ''}`;
}

function HWGT_memberTrackerExportRows(data) {
    const epochById = new Map(data.epochs.map(epoch => [epoch.id, epoch]));
    const identity = (memberId, fallbackName = '') => {
        const member = data.catalog.members?.[memberId] || {};
        const classifications = Object.entries(HWGT_MEMBER_CLASSIFICATIONS)
            .filter(([id]) => member.classifications?.[id] === true)
            .map(([, label]) => label);
        const suffixIds = [
            ['warChamber', 'WC'], ['juniorWarChamber', 'JWC'],
            ['leadershipCouncil', 'Council'], ['gangStaff', 'Staff']
        ];
        return {
            memberName: member.name || fallbackName || `#${memberId}`,
            memberId,
            profileUrl: member.profileUrl || '',
            classifications,
            classificationSuffix: suffixIds
                .filter(([id]) => member.classifications?.[id] === true)
                .map(([, label]) => label),
            whitelistTitle: member.whitelistTitle || ''
        };
    };
    const common = (epoch, memberId, member, capturedAt) => {
        const timezone = data.settings.groups?.[epoch.group]?.schedule?.timezone || 'local';
        return {
            capturedAt: new Date(capturedAt).toISOString(),
            displayTimestamp: HWGT_exportTimestamp(capturedAt, timezone),
            epochBoundary: new Date(epoch.boundaryAt).toISOString(),
            category: HWGT_MEMBER_GROUPS[epoch.group]?.label || epoch.group,
            categoryId: epoch.group,
            ...identity(memberId, member?.name),
            membershipState: member?.membershipState || 'current'
        };
    };
    const rows = [];

    data.epochs.forEach(epoch => {
        Object.entries(epoch.baseline || {}).forEach(([memberId, member]) => {
            Object.keys(member.rawValues || member.values || {}).forEach(statId => {
                const value = HWGT_snapshotRaw(member, statId);
                rows.push({
                    ...common(epoch, memberId, member, member.capturedAt || epoch.firstCapturedAt),
                    stat: HWGT_MEMBER_GROUPS[epoch.group]?.stats?.[statId]?.[1] || statId,
                    statId,
                    latestValue: value,
                    priorSnapshot: null,
                    firstSnapshot: value,
                    intervalDelta: 0,
                    epochDelta: 0
                });
            });
        });
    });

    data.events.forEach(event => {
        const epoch = epochById.get(event.epochId);
        if (!epoch) return;
        Object.entries(event.changes || {}).forEach(([statId, change]) => {
            const baseline = epoch.baseline?.[event.memberId];
            rows.push({
                ...common(epoch, event.memberId, event, event.at),
                stat: HWGT_MEMBER_GROUPS[event.group]?.stats?.[statId]?.[1] || statId,
                statId,
                latestValue: change.toRaw ?? change.to ?? null,
                priorSnapshot: change.fromRaw ?? change.from ?? null,
                firstSnapshot: HWGT_snapshotRaw(baseline, statId),
                intervalDelta: change.delta,
                epochDelta: change.epochDelta
            });
        });
    });

    return rows.sort((a, b) =>
        Date.parse(b.capturedAt) - Date.parse(a.capturedAt) ||
        a.category.localeCompare(b.category) ||
        a.memberName.localeCompare(b.memberName) ||
        a.stat.localeCompare(b.stat)
    );
}

function HWGT_markdownExport(rows) {
    const escape = value => String(value ?? '').replace(/([\\`*_[\]<>])/g, '\\$1');
    const categories = new Map();
    rows.forEach(row => {
        if (!categories.has(row.category)) categories.set(row.category, new Map());
        const dates = categories.get(row.category);
        if (!dates.has(row.displayTimestamp)) dates.set(row.displayTimestamp, new Map());
        const members = dates.get(row.displayTimestamp);
        if (!members.has(row.memberId)) members.set(row.memberId, []);
        members.get(row.memberId).push(row);
    });
    const output = [];
    categories.forEach((dates, category) => {
        output.push(`## ${escape(category)}`, '');
        dates.forEach((members, timestamp) => {
            output.push(`### ${timestamp}`, '');
            members.forEach(memberRows => {
                const first = memberRows[0];
                const name = escape(first.memberName);
                const linkedName = first.profileUrl ? `[${name}](${first.profileUrl})` : name;
                const suffix = first.classificationSuffix.length
                    ? ` — ${escape(first.classificationSuffix.join(', '))}`
                    : '';
                output.push(`**${linkedName} (${escape(first.memberId)})**${suffix}`);
                memberRows.forEach(row => {
                    output.push(
                        `- ${escape(row.stat)} — ${escape(HWGT_groupExportNumber(row.latestValue))} ` +
                        `[${escape(HWGT_groupExportNumber(row.priorSnapshot))}] ` +
                        `(*${escape(HWGT_exportDelta(row.intervalDelta))}* | *${escape(HWGT_exportDelta(row.epochDelta))}*)`
                    );
                });
                output.push('');
            });
        });
    });
    return output.join('\n').trim();
}

function HWGT_plainTextExport(rows) {
    const valueWidths = {
        speed: 10,
        power: 10,
        strength: 10,
        tbs: 10,
        life: 10,
        begging: 5,
        mining: 5,
        drinking: 5,
        intelligence: 5,
        level: 5,
        age: 6,
        lastActive: 6
    };
    const statValue = (value, statId) => {
        const formatted = HWGT_groupExportNumber(value);
        const width = valueWidths[statId] || 0;
        return width ? formatted.padStart(width) : formatted;
    };
    const statLabelWidth = rows.reduce(
        (longest, row) => Math.max(longest, String(row.stat || '').length),
        0
    ) + 1;
    const members = new Map();
    rows.forEach(row => {
        if (!members.has(row.memberId)) members.set(row.memberId, []);
        members.get(row.memberId).push(row);
    });
    const output = [];
    members.forEach(memberRows => {
        memberRows.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
        const first = memberRows[0];
        const suffix = first.classificationSuffix.length
            ? ` - ${first.classificationSuffix.join(', ')}`
            : '';
        const memberIdentity = `${first.memberName} (${first.memberId})`.padEnd(35);
        output.push(`${memberIdentity}${suffix}`);
        memberRows.forEach(row => {
            const statLabel = String(row.stat || '').padEnd(statLabelWidth);
            const latestValue = statValue(row.latestValue, row.statId);
            const priorSnapshot = statValue(row.priorSnapshot, row.statId);
            output.push(
                `${row.displayTimestamp} ${statLabel}- ${latestValue} ` +
                `[${priorSnapshot}] ` +
                `(${HWGT_exportDelta(row.intervalDelta)} | ${HWGT_exportDelta(row.epochDelta)})`
            );
        });
        output.push('');
    });
    return output.join('\n').trim();
}

function HWGT_buildMemberTrackerExport(data, format) {
    const rows = HWGT_memberTrackerExportRows(data);
    if (format === 'markdown') {
        return { text: HWGT_markdownExport(rows), mime: 'text/markdown', extension: 'md' };
    }
    if (format === 'text') {
        return { text: HWGT_plainTextExport(rows), mime: 'text/plain', extension: 'txt' };
    }
    if (format === 'json') {
        return { text: JSON.stringify(rows, null, 2), mime: 'application/json', extension: 'json' };
    }
    return { text: HWGT_plainTextExport(rows), mime: 'text/plain', extension: 'txt' };
}

function HWGT_deleteMemberTrackerData(filters, commit = false) {
    const data = HWGT_loadMemberTrackerData();
    const groupMatches = group => !filters.group || filters.group === group;
    const epochMatches = epochId => !filters.epoch || filters.epoch === epochId;
    const memberMatches = memberId => !filters.memberId || filters.memberId === memberId;
    const classificationMatches = memberId =>
        HWGT_memberHasClassification(data, memberId, filters.classification);
    const hasMagnitude = Number.isFinite(filters.minMagnitude) || Number.isFinite(filters.maxMagnitude);
    const hasBreakpoint = Number.isFinite(filters.breakpoint) && filters.breakpoint > 0;
    const changeMatches = change => {
        const delta = Number(change?.delta);
        if (hasMagnitude) {
            if (!Number.isFinite(delta)) return false;
            const magnitude = Math.abs(delta);
            if (Number.isFinite(filters.minMagnitude) && magnitude < filters.minMagnitude) return false;
            if (Number.isFinite(filters.maxMagnitude) && magnitude > filters.maxMagnitude) return false;
        }
        if (hasBreakpoint) {
            const from = Number(change?.fromNumeric ?? HWGT_parseTrackedNumber(change?.from));
            const to = Number(change?.toNumeric ?? HWGT_parseTrackedNumber(change?.to));
            if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
            const crossed =
                Math.floor(Math.abs(from) / filters.breakpoint) !==
                Math.floor(Math.abs(to) / filters.breakpoint);
            if (filters.breakpointMode === 'crossed' && !crossed) return false;
            if (filters.breakpointMode === 'not-crossed' && crossed) return false;
        }
        return true;
    };

    let eventCount = 0;
    let changeCount = 0;
    const remainingEvents = [];
    data.events.forEach(event => {
        if (
            !groupMatches(event.group) ||
            !epochMatches(event.epochId) ||
            !memberMatches(event.memberId) ||
            !classificationMatches(event.memberId)
        ) {
            remainingEvents.push(event);
            return;
        }

        const entries = Object.entries(event.changes || {});
        if (!entries.length) {
            if (!hasMagnitude && !hasBreakpoint) {
                eventCount++;
                return;
            }
            remainingEvents.push(event);
            return;
        }

        const retainedChanges = {};
        entries.forEach(([stat, change]) => {
            if (changeMatches(change)) changeCount++;
            else retainedChanges[stat] = change;
        });
        if (Object.keys(retainedChanges).length) {
            remainingEvents.push({ ...event, changes: retainedChanges });
        } else {
            eventCount++;
        }
    });

    let snapshotCount = 0;
    let epochCount = 0;
    const remainingEpochs = [];
    data.epochs.forEach(epoch => {
        if (!groupMatches(epoch.group) || !epochMatches(epoch.id) || hasMagnitude || hasBreakpoint) {
            remainingEpochs.push(epoch);
            return;
        }

        const clone = { ...epoch, baseline: { ...(epoch.baseline || {}) }, latest: { ...(epoch.latest || {}) } };
        ['baseline', 'latest'].forEach(snapshotType => {
            Object.entries(clone[snapshotType]).forEach(([memberId, member]) => {
                if (memberMatches(memberId) && classificationMatches(memberId)) {
                    delete clone[snapshotType][memberId];
                    snapshotCount++;
                }
            });
        });

        if (!Object.keys(clone.baseline).length && !Object.keys(clone.latest).length) {
            epochCount++;
        } else {
            remainingEpochs.push(clone);
        }
    });

    let visitCount = 0;
    const mayDeleteVisits = !filters.memberId && !filters.classification && !hasMagnitude && !hasBreakpoint;
    const remainingVisits = data.visits.filter(visit => {
        const remove = mayDeleteVisits && groupMatches(visit.group) && epochMatches(visit.epochId);
        if (remove) visitCount++;
        return !remove;
    });

    let catalogCount = 0;
    if (!filters.group && !filters.epoch && !hasMagnitude && !hasBreakpoint) {
        Object.entries(data.catalog.members).forEach(([memberId, member]) => {
            if (memberMatches(memberId) && classificationMatches(memberId)) {
                catalogCount++;
                if (commit) {
                    delete data.catalog.members[memberId];
                    delete data.settings.exceptions[memberId];
                }
            }
        });
    }

    const total = eventCount + changeCount + snapshotCount + epochCount + visitCount + catalogCount;
    if (commit && total) {
        data.events = remainingEvents;
        data.epochs = remainingEpochs;
        data.visits = remainingVisits;
        HWGT_saveMemberTrackerData(data);
    }

    return { total, eventCount, changeCount, snapshotCount, epochCount, visitCount, catalogCount };
}

function HWGT_loadModuleStates() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HWGT_SETTINGS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function HWGT_isModuleEnabled(id) {
    return HWGT_loadModuleStates()[id] !== false;
}

function HWGT_setModuleEnabled(id, enabled) {
    const states = HWGT_loadModuleStates();
    states[id] = Boolean(enabled);
    localStorage.setItem(HWGT_SETTINGS_KEY, JSON.stringify(states));
}

(function renderHWGTPreferences() {
    'use strict';

    const url = new URL(location.href);
    if (!url.pathname.endsWith('/game/game.php')) return;
    if (url.searchParams.get('cmd') !== 'preferences') return;

    const allowedKeys = new Set(['sr', 'cmd']);
    if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key))) return;

    const content = document.querySelector('.content-area');
    if (!content || document.getElementById('hwgt-preferences-panel')) return;

    const style = document.createElement('style');
    style.id = 'hwgt-preferences-styles';
    style.textContent = `
        #hwgt-preferences-panel {
            float: right;
            width: min(440px, 48%);
            margin: 0 0 18px 12px;
            padding: 10px 12px 12px;
            box-sizing: border-box;
            border: 1px solid #c7c7c7;
            border-radius: 5px;
            background: #f3f3f3;
            color: #111;
            font: 13px Arial, sans-serif;
        }
        #hwgt-preferences-panel .hwgt-title-row {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 4px;
            margin-bottom: 3px;
        }
        #hwgt-preferences-panel .hwgt-title {
            font-size: 20px;
            font-weight: bold;
            letter-spacing: .5px;
        }
        #hwgt-preferences-panel .hwgt-version,
        #hwgt-preferences-panel .hwgt-module-version {
            color: #888;
            font-size: 10px;
        }
        #hwgt-preferences-panel .hwgt-subtitle {
            margin-bottom: 10px;
            text-align: center;
            color: #666;
            font-size: 11px;
        }
        #hwgt-preferences-panel .hwgt-module-list {
            display: grid;
            gap: 7px;
        }
        #hwgt-preferences-panel .hwgt-module-option {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background: #fff;
            cursor: pointer;
        }
        #hwgt-preferences-panel .hwgt-module-option:hover {
            background: #f7fff9;
            border-color: #8eb99d;
        }
        #hwgt-preferences-panel .hwgt-module-option input {
            margin: 0;
        }
        #hwgt-preferences-panel .hwgt-module-name {
            flex: 1 1 auto;
            font-weight: bold;
        }
        #hwgt-preferences-panel .hwgt-note {
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            text-align: center;
            color: #777;
            font-size: 10px;
        }
        #hwgt-preferences-panel .hwgt-tracker-module {
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background: #fff;
        }
        #hwgt-preferences-panel .hwgt-tracker-heading {
            display: flex;
            align-items: center;
            gap: 7px;
            font-weight: bold;
        }
        #hwgt-preferences-panel .hwgt-tracker-heading input {
            margin: 0;
        }
        #hwgt-preferences-panel .hwgt-tracker-heading .hwgt-module-name {
            flex: 1 1 auto;
        }
        #hwgt-preferences-panel .hwgt-tracker-help {
            margin: 6px 0 8px 22px;
            color: #666;
            font-size: 10px;
        }
        #hwgt-preferences-panel .hwgt-tracker-body[hidden] {
            display: none;
        }
        #hwgt-preferences-panel .hwgt-tracker-groups {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
        }
        #hwgt-preferences-panel .hwgt-tracker-section,
        #hwgt-preferences-panel .hwgt-tracker-group {
            border: 1px solid #d2d2d2;
            border-radius: 3px;
            background: #fafafa;
        }
        #hwgt-preferences-panel .hwgt-tracker-section {
            margin-top: 7px;
        }
        #hwgt-preferences-panel .hwgt-tracker-section > summary,
        #hwgt-preferences-panel .hwgt-tracker-group > summary {
            padding: 5px 6px;
            cursor: pointer;
            font-weight: bold;
        }
        #hwgt-preferences-panel .hwgt-tracker-group-title {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        #hwgt-preferences-panel .hwgt-tracker-group-reset {
            float: right;
            margin: -1px 0 0 6px;
            padding: 0 2px;
            border: 0;
            background: transparent;
            color: #666;
            font: 11px Arial, sans-serif;
            cursor: pointer;
        }
        #hwgt-preferences-panel .hwgt-tracker-group-reset:hover {
            color: #111;
        }
        #hwgt-preferences-panel .hwgt-schedule-summary {
            display: block;
            margin: 0 5px 5px;
            color: #777;
            font-size: 9px;
        }
        #hwgt-preferences-panel .hwgt-tracker-muted {
            opacity: .42;
            filter: grayscale(1);
        }
        #hwgt-preferences-panel .hwgt-tracker-fields {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            padding: 0 6px 7px;
        }
        #hwgt-preferences-panel .hwgt-tracker-fields label,
        #hwgt-preferences-panel .hwgt-export-fields label,
        #hwgt-preferences-panel .hwgt-destroy-fields label {
            display: grid;
            gap: 2px;
            min-width: 0;
            color: #555;
            font-size: 9px;
        }
        #hwgt-preferences-panel .hwgt-tracker-fields input,
        #hwgt-preferences-panel .hwgt-tracker-fields select,
        #hwgt-preferences-panel .hwgt-export-fields select,
        #hwgt-preferences-panel .hwgt-destroy-fields input,
        #hwgt-preferences-panel .hwgt-destroy-fields select {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            font: 11px Arial, sans-serif;
        }
        #hwgt-preferences-panel .hwgt-tracker-wide {
            grid-column: 1 / -1;
        }
        #hwgt-preferences-panel .hwgt-exception-wrap {
            max-height: 170px;
            overflow: auto;
            padding: 0 6px 6px;
        }
        #hwgt-preferences-panel .hwgt-exception-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
        }
        #hwgt-preferences-panel .hwgt-exception-table th,
        #hwgt-preferences-panel .hwgt-exception-table td {
            padding: 2px 3px;
            border-bottom: 1px solid #ddd;
            text-align: center;
        }
        #hwgt-preferences-panel .hwgt-exception-table th:first-child,
        #hwgt-preferences-panel .hwgt-exception-table td:first-child {
            text-align: left;
        }
        #hwgt-preferences-panel .hwgt-export-fields,
        #hwgt-preferences-panel .hwgt-destroy-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 5px;
            padding: 0 6px 7px;
        }
        #hwgt-preferences-panel .hwgt-button-row {
            display: flex;
            justify-content: flex-end;
            gap: 5px;
            grid-column: 1 / -1;
        }
        #hwgt-preferences-panel .hwgt-button-row button {
            padding: 3px 7px;
            cursor: pointer;
        }
        #hwgt-preferences-panel .hwgt-destroy-button {
            color: #8b0000;
        }
        #hwgt-preferences-panel .hwgt-storage-summary {
            margin-right: 6px;
            color: #777;
            font-size: 9px;
            font-weight: normal;
        }
        @media (max-width: 820px) {
            #hwgt-preferences-panel .hwgt-tracker-groups {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = 'hwgt-preferences-panel';

    const titleRow = document.createElement('div');
    titleRow.className = 'hwgt-title-row';

    const title = document.createElement('div');
    title.className = 'hwgt-title';
    title.textContent = 'HW Gang Tools Suite';

    const version = document.createElement('span');
    version.className = 'hwgt-version';
    version.textContent = `v${(typeof GM_info === 'object' && GM_info?.script?.version) || '1.0'}`;
    titleRow.append(title, version);

    const subtitle = document.createElement('div');
    subtitle.className = 'hwgt-subtitle';
    subtitle.textContent = 'Component Controls';

    const moduleList = document.createElement('div');
    moduleList.className = 'hwgt-module-list';

    const optionSelect = (options, value) => {
        const select = document.createElement('select');
        options.forEach(([optionValue, optionLabel]) => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionLabel;
            option.selected = String(optionValue) === String(value);
            select.appendChild(option);
        });
        return select;
    };

    const field = (caption, control, className = '') => {
        const label = document.createElement('label');
        if (className) label.className = className;
        const span = document.createElement('span');
        span.textContent = caption;
        label.append(span, control);
        return label;
    };

    const setSelectValue = (select, value) => {
        const wanted = String(value);
        Array.from(select.options).forEach(option => {
            option.toggleAttribute('selected', option.value === wanted);
        });
        try {
            select.value = wanted;
        } catch (_) {
            // The selected option attributes above remain authoritative.
        }
    };

    const renderMemberTrackerModule = (labelText, componentVersion) => {
        let trackerData = HWGT_loadMemberTrackerData();
        const card = document.createElement('section');
        card.className = 'hwgt-tracker-module';

        const heading = document.createElement('div');
        heading.className = 'hwgt-tracker-heading';
        const master = document.createElement('input');
        master.type = 'checkbox';
        master.checked = HWGT_isModuleEnabled('member-stats');
        const name = document.createElement('span');
        name.className = 'hwgt-module-name';
        name.textContent = labelText;
        const versionLabel = document.createElement('span');
        versionLabel.className = 'hwgt-module-version';
        versionLabel.textContent = componentVersion;
        heading.append(master, name, versionLabel);

        const help = document.createElement('div');
        help.className = 'hwgt-tracker-help';
        help.textContent = 'Choose what to track and configure each group\u2019s reset window and retention.';

        const body = document.createElement('div');
        body.className = 'hwgt-tracker-body';
        body.hidden = !master.checked;
        master.addEventListener('change', () => {
            HWGT_setModuleEnabled('member-stats', master.checked);
            body.hidden = !master.checked;
        });

        const groups = document.createElement('div');
        groups.className = 'hwgt-tracker-groups';
        const exceptionCheckboxes = [];

        const scheduleSummary = schedule => {
            const time = schedule.time || '00:00';
            if (schedule.frequency === 'daily') return `Daily at ${time}`;
            if (schedule.frequency === 'weekly') {
                const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(schedule.weekday) || 0];
                return `Weekly \u00b7 ${day} ${time}`;
            }
            if (schedule.frequency === 'monthly') return `Monthly \u00b7 day ${schedule.monthDay || 1} at ${time}`;
            const interval = schedule.frequency === 'biweekly' ? 14 : schedule.intervalDays;
            return `Every ${interval} days \u00b7 ${time}`;
        };

        const refreshExceptionChecks = () => {
            exceptionCheckboxes.forEach(checkbox => {
                checkbox.checked = HWGT_memberIsExcepted(
                    trackerData.settings,
                    checkbox.dataset.memberId,
                    checkbox.dataset.group
                );
            });
        };

        Object.entries(HWGT_MEMBER_GROUPS).forEach(([groupId, definition]) => {
            const groupSettings = trackerData.settings.groups[groupId];
            const details = document.createElement('details');
            details.className = 'hwgt-tracker-group';
            const summary = document.createElement('summary');
            const titleWrap = document.createElement('span');
            titleWrap.className = 'hwgt-tracker-group-title';
            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.checked = groupSettings.enabled;
            enabled.addEventListener('click', event => event.stopPropagation());
            const titleText = document.createElement('span');
            titleText.textContent = definition.label;
            titleWrap.append(enabled, titleText);
            const resetGroup = document.createElement('button');
            resetGroup.type = 'button';
            resetGroup.className = 'hwgt-tracker-group-reset';
            resetGroup.textContent = '[↻]';
            resetGroup.title = "Reset This Group's Snapshot Window Settings";
            resetGroup.setAttribute('aria-label', resetGroup.title);
            summary.append(titleWrap, resetGroup);

            const summaryLine = document.createElement('span');
            summaryLine.className = 'hwgt-schedule-summary';
            summaryLine.textContent = scheduleSummary(groupSettings.schedule);

            const fields = document.createElement('div');
            fields.className = 'hwgt-tracker-fields';
            const frequency = optionSelect([
                ['daily', 'Daily'],
                ['weekly', 'Weekly'],
                ['biweekly', 'Biweekly'],
                ['monthly', 'Monthly'],
                ['interval', 'Every N days']
            ], groupSettings.schedule.frequency);
            const weekday = optionSelect([
                ['0', 'Sunday'], ['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'],
                ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday']
            ], groupSettings.schedule.weekday);
            const monthDay = document.createElement('input');
            monthDay.type = 'number';
            monthDay.min = '1';
            monthDay.max = '31';
            monthDay.value = groupSettings.schedule.monthDay;
            const intervalDays = document.createElement('input');
            intervalDays.type = 'number';
            intervalDays.min = '1';
            intervalDays.max = '3650';
            intervalDays.value = groupSettings.schedule.intervalDays;
            const anchorDate = document.createElement('input');
            anchorDate.type = 'text';
            anchorDate.inputMode = 'numeric';
            anchorDate.maxLength = 5;
            anchorDate.placeholder = 'MM/DD';
            anchorDate.pattern = '\\d{1,2}/\\d{1,2}';
            anchorDate.style.width = '7ch';
            anchorDate.value = HWGT_compactAnchorDate(groupSettings.schedule.anchorDate);
            anchorDate.title = 'Month and day. The applicable year is retained internally and included in exports.';
            const time = document.createElement('input');
            time.type = 'time';
            time.value = groupSettings.schedule.time;
            const timezone = optionSelect([
                ['local', 'Local Time'],
                ['server', 'Server Time']
            ], groupSettings.schedule.timezone);
            timezone.title = 'Server Time uses Australia/Brisbane (AEST, UTC+10).';
            const retentionValue = document.createElement('input');
            retentionValue.type = 'number';
            retentionValue.min = '1';
            retentionValue.max = '24';
            retentionValue.value = groupSettings.retention.value;
            const retentionUnit = optionSelect([
                ['days', 'days'], ['weeks', 'weeks'], ['months', 'months']
            ], groupSettings.retention.unit);

            const frequencyField = field('Reset Frequency', frequency);
            const weekdayField = field('Reset Weekday', weekday);
            const monthDayField = field('Day of Month', monthDay);
            const intervalField = field('Interval Days', intervalDays);
            const anchorField = field('Anchor Date', anchorDate);
            const timeField = field('Epoch Boundary', time);
            const timezoneField = field('Time Zone', timezone);
            const retentionField = document.createElement('label');
            retentionField.className = 'hwgt-tracker-wide';
            const retentionCaption = document.createElement('span');
            retentionCaption.textContent = 'Retain Records For';
            const retentionControls = document.createElement('span');
            retentionControls.style.display = 'grid';
            retentionControls.style.gridTemplateColumns = '1fr 1fr';
            retentionControls.style.gap = '4px';
            retentionControls.append(retentionValue, retentionUnit);
            retentionField.append(retentionCaption, retentionControls);
            fields.append(
                anchorField, timeField, frequencyField, intervalField,
                weekdayField, monthDayField, timezoneField, retentionField
            );

            const setFieldActive = (fieldElement, active) => {
                fieldElement.classList.toggle('hwgt-tracker-muted', !active);
                fieldElement.querySelectorAll('input, select').forEach(control => {
                    control.style.pointerEvents = active ? '' : 'none';
                    control.tabIndex = active ? 0 : -1;
                    control.setAttribute('aria-disabled', String(!active));
                });
            };
            const syncRetentionLimits = () => {
                const maxima = { days: 7, weeks: 52, months: 24 };
                const maximum = maxima[retentionUnit.value] || 24;
                retentionValue.min = '1';
                retentionValue.max = String(maximum);
                retentionValue.value = String(Math.min(maximum, Math.max(1, Number(retentionValue.value) || 1)));
            };
            const syncConditionalFields = () => {
                const selected = frequency.value;
                const categoryEnabled = enabled.checked;
                const activeFields = new Set(['frequency', 'time', 'timezone', 'retention']);
                if (selected === 'weekly') activeFields.add('weekday');
                if (selected === 'monthly') activeFields.add('monthDay');
                if (selected === 'biweekly') activeFields.add('anchor');
                if (selected === 'interval') {
                    activeFields.add('interval');
                    activeFields.add('anchor');
                }
                const fieldMap = {
                    frequency: frequencyField, weekday: weekdayField,
                    monthDay: monthDayField, interval: intervalField,
                    anchor: anchorField, time: timeField,
                    timezone: timezoneField, retention: retentionField
                };
                Object.entries(fieldMap).forEach(([id, fieldElement]) => {
                    setFieldActive(fieldElement, categoryEnabled && activeFields.has(id));
                });
                summaryLine.classList.toggle('hwgt-tracker-muted', !categoryEnabled);
            };

            const saveGroup = () => {
                syncRetentionLimits();
                const resolvedAnchor = HWGT_resolveAnchorDate(
                    anchorDate.value,
                    groupSettings.schedule.anchorDate,
                    { ...groupSettings.schedule, timezone: timezone.value }
                );
                anchorDate.value = HWGT_compactAnchorDate(resolvedAnchor);
                groupSettings.enabled = enabled.checked;
                groupSettings.schedule = {
                    frequency: frequency.value,
                    weekday: Number(weekday.value),
                    monthDay: Math.min(31, Math.max(1, Number(monthDay.value) || 1)),
                    intervalDays: Math.min(3650, Math.max(1, Number(intervalDays.value) || 1)),
                    anchorDate: resolvedAnchor || groupSettings.schedule.anchorDate,
                    time: time.value || '00:00',
                    timezone: timezone.value
                };
                groupSettings.retention = {
                    value: Number(retentionValue.value),
                    unit: retentionUnit.value
                };
                trackerData.settings.groups[groupId] = groupSettings;
                HWGT_saveMemberTrackerData(trackerData);
                summaryLine.textContent = scheduleSummary(groupSettings.schedule);
                syncConditionalFields();
                refreshExceptionChecks();
            };

            resetGroup.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (!confirm(`Reset the ${definition.label} group's snapshot window settings?`)) return;
                const defaultGroup = HWGT_defaultMemberTrackerSettings().groups[groupId];
                groupSettings.schedule = { ...defaultGroup.schedule };
                groupSettings.retention = { ...defaultGroup.retention };
                setSelectValue(frequency, groupSettings.schedule.frequency);
                setSelectValue(weekday, groupSettings.schedule.weekday);
                monthDay.value = String(groupSettings.schedule.monthDay);
                intervalDays.value = String(groupSettings.schedule.intervalDays);
                anchorDate.value = HWGT_compactAnchorDate(groupSettings.schedule.anchorDate);
                time.value = groupSettings.schedule.time;
                setSelectValue(timezone, groupSettings.schedule.timezone);
                retentionValue.value = String(groupSettings.retention.value);
                setSelectValue(retentionUnit, groupSettings.retention.unit);
                trackerData.settings.groups[groupId] = groupSettings;
                HWGT_saveMemberTrackerData(trackerData);
                summaryLine.textContent = scheduleSummary(groupSettings.schedule);
                syncRetentionLimits();
                syncConditionalFields();
                refreshExceptionChecks();
            });

            [enabled, frequency, weekday, monthDay, intervalDays, anchorDate, time, timezone, retentionValue, retentionUnit]
                .forEach(control => control.addEventListener('change', saveGroup));
            syncRetentionLimits();
            syncConditionalFields();
            details.append(summary, summaryLine, fields);
            groups.appendChild(details);
        });

        const exceptions = document.createElement('details');
        exceptions.className = 'hwgt-tracker-section';
        const exceptionsSummary = document.createElement('summary');
        exceptionsSummary.textContent = 'Per-Hobo Exceptions';
        const exceptionWrap = document.createElement('div');
        exceptionWrap.className = 'hwgt-exception-wrap';
        const knownCatalogMembers = Object.entries(trackerData.catalog.members)
            .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
        const knownMembers = knownCatalogMembers.filter(([, member]) =>
            Number.isFinite(Number(member.classificationCapturedAt?.membersList))
        );
        if (!knownMembers.length) {
            exceptionWrap.textContent = 'Visit the Members List once to populate member controls.';
        } else {
            const table = document.createElement('table');
            table.className = 'hwgt-exception-table';
            const head = document.createElement('thead');
            const headRow = document.createElement('tr');
            ['Hobo', ...Object.values(HWGT_MEMBER_GROUPS).map(group => group.label)]
                .forEach(text => {
                    const th = document.createElement('th');
                    th.textContent = text;
                    headRow.appendChild(th);
                });
            head.appendChild(headRow);
            const tbody = document.createElement('tbody');
            knownMembers.forEach(([memberId, member]) => {
                const row = document.createElement('tr');
                const memberCell = document.createElement('td');
                memberCell.textContent = `${member.name || `#${memberId}`}${member.membershipState === 'former' ? ' (former)' : ''}`;
                row.appendChild(memberCell);
                Object.keys(HWGT_MEMBER_GROUPS).forEach(groupId => {
                    const cell = document.createElement('td');
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.dataset.memberId = memberId;
                    checkbox.dataset.group = groupId;
                    checkbox.title = 'Checked means this hobo uses exception handling for this category.';
                    checkbox.checked = HWGT_memberIsExcepted(trackerData.settings, memberId, groupId);
                    exceptionCheckboxes.push(checkbox);
                    checkbox.addEventListener('change', () => {
                        if (!trackerData.settings.exceptions[memberId]) {
                            trackerData.settings.exceptions[memberId] = {};
                        }
                        if (checkbox.checked) {
                            trackerData.settings.exceptions[memberId][groupId] = true;
                        } else {
                            delete trackerData.settings.exceptions[memberId][groupId];
                        }
                        if (!Object.keys(trackerData.settings.exceptions[memberId]).length) {
                            delete trackerData.settings.exceptions[memberId];
                        }
                        HWGT_saveMemberTrackerData(trackerData);
                    });
                    cell.appendChild(checkbox);
                    row.appendChild(cell);
                });
                tbody.appendChild(row);
            });
            table.append(head, tbody);
            exceptionWrap.appendChild(table);
        }
        exceptions.append(exceptionsSummary, exceptionWrap);

        const exportSection = document.createElement('details');
        exportSection.className = 'hwgt-tracker-section';
        const exportSummary = document.createElement('summary');
        exportSummary.textContent = 'Copy / Export Data';
        const exportFields = document.createElement('div');
        exportFields.className = 'hwgt-export-fields';
        const format = optionSelect([
            ['text', 'Plain Text'], ['markdown', 'Markdown'], ['json', 'JSON']
        ], trackerData.settings.export.format);
        const exportButtons = document.createElement('div');
        exportButtons.className = 'hwgt-button-row';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy';
        const download = document.createElement('button');
        download.type = 'button';
        download.textContent = 'Download';
        const saveExportSettings = () => {
            trackerData.settings.export = { format: format.value };
            HWGT_saveMemberTrackerData(trackerData);
        };
        format.addEventListener('change', saveExportSettings);
        const buildExport = () => {
            saveExportSettings();
            return HWGT_buildMemberTrackerExport(trackerData, format.value);
        };
        copy.addEventListener('click', async () => {
            const output = buildExport();
            try {
                await navigator.clipboard.writeText(output.text);
            } catch (_) {
                const textarea = document.createElement('textarea');
                textarea.value = output.text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
            }
            copy.textContent = '\u2713 Copied';
            setTimeout(() => { copy.textContent = 'Copy'; }, 900);
        });
        download.addEventListener('click', () => {
            const output = buildExport();
            const blob = new Blob([output.text], { type: `${output.mime};charset=utf-8` });
            const href = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.download = `HW Gang Member Stats ${new Date().toISOString().slice(0, 10)}.${output.extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(href), 0);
        });
        exportButtons.append(copy, download);
        exportFields.append(field('Format', format, 'hwgt-tracker-wide'), exportButtons);
        exportSection.append(exportSummary, exportFields);

        const destroySection = document.createElement('details');
        destroySection.className = 'hwgt-tracker-section';
        const destroySummary = document.createElement('summary');
        destroySummary.textContent = 'Deletion Handling';
        const storageSummary = document.createElement('span');
        storageSummary.className = 'hwgt-storage-summary';
        storageSummary.textContent = ` ${trackerData.epochs.length} epochs \u00b7 ${trackerData.events.length} events`;
        destroySummary.appendChild(storageSummary);
        const destroyFields = document.createElement('div');
        destroyFields.className = 'hwgt-destroy-fields';
        const memberFilter = optionSelect([
            ['', 'All hobos'],
            ...knownCatalogMembers.map(([memberId, member]) => [memberId, `${member.name || `#${memberId}`} (#${memberId})`])
        ], '');
        const groupFilter = optionSelect([
            ['', 'All groups'],
            ...Object.entries(HWGT_MEMBER_GROUPS).map(([id, group]) => [id, group.label])
        ], '');
        const epochFilter = optionSelect([
            ['', 'All epochs'],
            ...trackerData.epochs
                .slice()
                .sort((a, b) => b.boundaryAt - a.boundaryAt)
                .map(epoch => [epoch.id, `${HWGT_MEMBER_GROUPS[epoch.group]?.label || epoch.group} \u00b7 ${new Date(epoch.boundaryAt).toLocaleString()}`])
        ], '');
        const refreshEpochFilter = () => {
            const selected = epochFilter.value;
            const choices = trackerData.epochs
                .filter(epoch => !groupFilter.value || epoch.group === groupFilter.value)
                .slice()
                .sort((a, b) => b.boundaryAt - a.boundaryAt);
            epochFilter.replaceChildren();
            const all = document.createElement('option');
            all.value = '';
            all.textContent = 'All epochs';
            epochFilter.appendChild(all);
            choices.forEach(epoch => {
                const option = document.createElement('option');
                option.value = epoch.id;
                option.textContent = `${HWGT_MEMBER_GROUPS[epoch.group]?.label || epoch.group} \u00b7 ${new Date(epoch.boundaryAt).toLocaleString()}`;
                epochFilter.appendChild(option);
            });
            epochFilter.value = choices.some(epoch => epoch.id === selected) ? selected : '';
        };
        groupFilter.addEventListener('change', refreshEpochFilter);
        const classificationFilter = optionSelect([
            ['', 'Any member classification'],
            ...Object.entries(HWGT_MEMBER_CLASSIFICATIONS)
        ], '');
        const minMagnitude = document.createElement('input');
        minMagnitude.type = 'number';
        minMagnitude.min = '0';
        minMagnitude.placeholder = 'No minimum';
        const maxMagnitude = document.createElement('input');
        maxMagnitude.type = 'number';
        maxMagnitude.min = '0';
        maxMagnitude.placeholder = 'No maximum';
        const breakpoint = document.createElement('input');
        breakpoint.type = 'number';
        breakpoint.min = '1';
        breakpoint.placeholder = 'Disabled';
        breakpoint.title = 'Optionally match changes that crossed a multiple of this value.';
        const breakpointMode = optionSelect([
            ['crossed', 'Crossed breakpoint'],
            ['not-crossed', 'Did not cross']
        ], 'crossed');
        breakpointMode.disabled = true;
        breakpoint.addEventListener('input', () => {
            breakpointMode.disabled = breakpoint.value === '';
        });
        const destroyButtons = document.createElement('div');
        destroyButtons.className = 'hwgt-button-row';
        const destroy = document.createElement('button');
        destroy.type = 'button';
        destroy.className = 'hwgt-destroy-button';
        destroy.textContent = 'Delete matching data\u2026';
        destroy.addEventListener('click', () => {
            const filters = {
                memberId: memberFilter.value,
                group: groupFilter.value,
                epoch: epochFilter.value,
                classification: classificationFilter.value,
                minMagnitude: minMagnitude.value === '' ? NaN : Math.abs(Number(minMagnitude.value)),
                maxMagnitude: maxMagnitude.value === '' ? NaN : Math.abs(Number(maxMagnitude.value)),
                breakpoint: breakpoint.value === '' ? NaN : Math.abs(Number(breakpoint.value)),
                breakpointMode: breakpointMode.value
            };
            const preview = HWGT_deleteMemberTrackerData(filters, false);
            if (!preview.total) {
                alert('No stored data matches those filters.');
                return;
            }
            const detail = [
                `${preview.changeCount} stat changes`,
                `${preview.eventCount} complete events`,
                `${preview.snapshotCount} snapshot rows`,
                `${preview.epochCount} empty epochs`,
                `${preview.visitCount} visit records`,
                `${preview.catalogCount} member records`
            ].join(', ');
            if (!confirm(`Permanently delete the matching tracker data?\n\n${detail}\n\nThis cannot be undone.`)) return;
            HWGT_deleteMemberTrackerData(filters, true);
            trackerData = HWGT_loadMemberTrackerData();
            storageSummary.textContent = ` ${trackerData.epochs.length} epochs \u00b7 ${trackerData.events.length} events`;
            refreshEpochFilter();
            alert('The matching tracker data was deleted.');
        });
        destroyButtons.appendChild(destroy);
        destroyFields.append(
            field('Hobo', memberFilter), field('Stat Page Group', groupFilter),
            field('Epoch', epochFilter, 'hwgt-tracker-wide'),
            field('Member Classification', classificationFilter, 'hwgt-tracker-wide'),
            field('Minimum |\u0394|', minMagnitude), field('Maximum |\u0394|', maxMagnitude),
            field('Breakpoint Size', breakpoint), field('Breakpoint Test', breakpointMode),
            destroyButtons
        );
        destroySection.append(destroySummary, destroyFields);

        body.append(groups, exceptions, exportSection, destroySection);
        card.append(heading, help, body);
        return card;
    };

    for (const [id, labelText, componentVersion] of HWGT_MODULES) {
        if (id === 'member-stats') {
            moduleList.appendChild(renderMemberTrackerModule(labelText, componentVersion));
            continue;
        }
        const label = document.createElement('label');
        label.className = 'hwgt-module-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = HWGT_isModuleEnabled(id);
        checkbox.addEventListener('change', () => {
            HWGT_setModuleEnabled(id, checkbox.checked);
        });

        const name = document.createElement('span');
        name.className = 'hwgt-module-name';
        name.textContent = labelText;

        const moduleVersion = document.createElement('span');
        moduleVersion.className = 'hwgt-module-version';
        moduleVersion.textContent = componentVersion;

        label.append(checkbox, name, moduleVersion);
        moduleList.appendChild(label);
    }

    const note = document.createElement('div');
    note.className = 'hwgt-note';
    note.textContent = 'Component toggles apply on the next page load; tracker settings save immediately.';

    panel.append(titleRow, subtitle, moduleList, note);
    content.insertBefore(panel, content.firstChild);

    HW_registerSharedSettingsProvider(panel, {
        id: 'gang-tools',
        label: 'Gang Tools',
        order: 30
    });
})();

/* ===== Component 1: HW Gang Incentives and Loans Aid v1.5 ===== */
(function () {
    'use strict';

    if (!HWGT_isModuleEnabled('gila')) return;

    const STORAGE_KEY = 'hwgt_gila_v1';
    const SESSION_LOADED_KEY = 'hwgt_gila_loaded_loan_v1';
    const SESSION_SUBMISSION_KEY = 'hwgt_gila_pending_submission_v1';
    const AUTO_BIND_WINDOW_MS = 10_000;
    const MEMBER_STATS_STORAGE_KEY = 'hwgt_gila_member_stats_v1';
    const DEFAULT_EDITOR_PRESET = '[i][hex=777777][hoboname-2924238] edit: [b]PAID[/b][/hex][/i]';
    const MINING_UNION_MONTHLY_CAP = 30_000_000;
    const MINING_UNION_EXPLOSIVES_MIN_STAT = 150;
    const MINING_UNION_GEAR = Object.freeze([
        { name: 'Pickaxe', cost: 1_000_000 },
        { name: "Miner's Cap", cost: 2_000_000 },
        { name: 'Pockets', cost: 5_000_000 },
        { name: 'Spelunking Satchel', cost: 7_500_000 },
        { name: 'Dynamite Pouch', cost: 10_000_000 },
        { name: 'Blast Jacket', cost: 20_000_000 }
    ]);
    const MINING_UNION_EXPLOSIVES = Object.freeze([
        { name: 'Dynamite Stick', cost: 1_000 },
        { name: 'Bundle of Dynamite', cost: 2_500 },
        { name: 'Bomb', cost: 5_000 },
        { name: 'Plastic Explosives', cost: 7_500 },
        { name: 'TNT', cost: 10_000 }
    ]);
    const MINING_UNION_GEAR_BY_NAME = new Map(
        MINING_UNION_GEAR.map(item => [item.name.toLowerCase(), item])
    );
    const MINING_UNION_EXPLOSIVE_BY_NAME = new Map(
        MINING_UNION_EXPLOSIVES.map(item => [item.name.toLowerCase(), item])
    );
    const DRINK_TANK_THREAD_ID = '20610095';
    const DRINK_TANK_TIERS = Object.freeze([400, 500, 600, 800]);
    const DRINK_TANK_DRINKS = Object.freeze([
        {
            name: 'Five Star General',
            memo: 'FSGs',
            cw: 20,
            flat: 0,
            aliases: /\b(?:five\s*star\s*generals?|f\.?\s*s\.?\s*g(?:\.?['’]?s)?|5\.?\s*s\.?\s*g(?:\.?['’]?s)?|fsgens?|generals?|gens)\b/i
        },
        {
            name: 'Rainbow Road',
            memo: 'RRs',
            cw: 24,
            flat: 0,
            aliases: /\b(?:rainbow\s*roads?|r\.?\s*roads?|r\.?\s*r(?:\.?['’]?s)?)\b/i
        },
        {
            name: 'Centrifuge',
            memo: 'Centrifuges',
            cw: 38,
            flat: 600,
            aliases: /(?:\bcentrifuges?\b|(?:^|\s)['’]?fuges?\b|\bnukes?\b)/i
        },
        {
            name: 'Ten Foot Drop',
            memo: 'TFDs',
            cw: 18,
            flat: 400,
            aliases: /\b(?:ten\s*foot\s*drops?|t\.?\s*f\.?\s*d(?:\.?['’]?s)?|10\s*[-.]?\s*f\.?\s*d(?:\.?['’]?s)?)\b/i
        },
        {
            name: 'The Long Walk',
            memo: 'TLWs',
            cw: 36,
            flat: 0,
            aliases: /\b(?:the\s*long\s*walks?|t\.?\s*l\.?\s*w\.?)\b/i
        }
    ]);

    const params = new URLSearchParams(window.location.search);
    const cmd = params.get('cmd') || '';
    const action = params.get('do') || '';

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    function loadData() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (!parsed || typeof parsed !== 'object') throw new Error('Invalid storage root');
            if (!parsed.threads || typeof parsed.threads !== 'object') parsed.threads = {};
            if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {};
            if (typeof parsed.settings.editorPreset !== 'string') {
                parsed.settings.editorPreset = DEFAULT_EDITOR_PRESET;
            }
            return parsed;
        } catch (err) {
            console.warn('HW GILA: could not parse storage; using an empty registry.', err);
            return { threads: {}, settings: { editorPreset: DEFAULT_EDITOR_PRESET } };
        }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function ensureThread(data, title, threadId = '') {
        if (!data.threads[title]) {
            data.threads[title] = {
                threadId: String(threadId || ''),
                title,
                payout: {
                    bankId: '',
                    bankLabel: '',
                    amount: '',
                    memo: title
                },
                recipients: {}
            };
        }

        const thread = data.threads[title];
        thread.title = title;
        if (threadId) thread.threadId = String(threadId);
        if (!thread.payout || typeof thread.payout !== 'object') {
            thread.payout = { bankId: '', bankLabel: '', amount: '', memo: title };
        }
        if (thread.payout.bankLabel === undefined) thread.payout.bankLabel = '';
        if (!thread.recipients || typeof thread.recipients !== 'object') {
            thread.recipients = {};
        }

        // v0.9 migration: legacy entries were keyed only by Hobo ID. Keep the
        // key stable, but make the Hobo ID explicit so multiple payout records
        // for the same player can coexist when they originate from different replies.
        Object.entries(thread.recipients).forEach(([key, recipient]) => {
            if (!recipient || typeof recipient !== 'object') return;
            if (!recipient.hoboId) {
                const legacyId = /^\d+$/.test(key) ? key : '';
                if (legacyId) recipient.hoboId = legacyId;
            }
            if (recipient.sourcePostId === undefined) recipient.sourcePostId = null;
        });

        return thread;
    }

    function addRecipient(thread, id, name, details = null, options = {}) {
        if (!id) return { added: false, key: '' };

        const hoboId = String(id);
        const sourcePostId = options.sourcePostId ? String(options.sourcePostId) : null;
        const key = options.key || (sourcePostId ? `post:${sourcePostId}` : hoboId);
        const existing = thread.recipients[key];

        if (existing) {
            existing.hoboId = hoboId;
            if (name) existing.recipient = name;
            if (sourcePostId) existing.sourcePostId = sourcePostId;
            if (details) {
                existing.amount = normalizeAmount(details.amount || '');
                existing.memo = String(details.memo ?? '').trim().substring(0, 60);
            }
            return { added: false, key };
        }

        thread.recipients[key] = {
            hoboId,
            sourcePostId,
            recipient: name || `#${hoboId}`,
            status: 'pending',
            nativeLoanId: null,
            amount: details ? normalizeAmount(details.amount || '') : null,
            memo: details ? String(details.memo ?? '').trim().substring(0, 60) : null
        };
        return { added: true, key };
    }

    // ---------------------------------------------------------------------
    // Milestone incentive normalization
    // ---------------------------------------------------------------------

    const MILESTONE_SCHEDULES = {
        level: {
            label: 'Level',
            memo: value => `lvl ${value}`,
            aliases: /\b(?:lv|lvl|level)\b/i,
            fixed: new Map([
                [200, 1_000_000],
                [300, 1_250_000],
                [400, 1_500_000],
                [500, 1_750_000],
                [600, 2_000_000],
                [650, 2_250_000],
                [700, 2_500_000],
                [750, 2_750_000],
                [800, 3_000_000],
                [825, 3_250_000],
                [850, 3_500_000],
                [875, 3_750_000],
                [900, 4_000_000],
                [925, 4_250_000],
                [950, 4_500_000],
                [975, 4_750_000],
                [1000, 5_000_000],
                [1025, 5_500_000],
                [1050, 6_000_000],
                [1075, 6_500_000],
                [1100, 7_000_000],
                [1125, 7_500_000],
                [1150, 8_000_000],
                [1175, 8_500_000],
                [1200, 9_000_000],
                [1225, 9_500_000]
            ]),
            recurring: { start: 1250, step: 25, payout: 10_000_000 }
        },
        intelligence: {
            label: 'Intelligence',
            memo: value => `${value} Int`,
            aliases: /\b(?:int|intel|intelligence)\b/i,
            fixed: new Map([
                [1250, 600_000],
                [1500, 750_000],
                [1750, 900_000],
                [2000, 1_000_000],
                [2250, 1_125_000],
                [2500, 1_250_000]
            ]),
            recurring: { start: 2550, step: 50, payout: 5_000_000 }
        },
        drinking: {
            label: 'Drinking',
            memo: value => `${value} Drinking`,
            aliases: /\b(?:drink|drinking|drink\s+stat)\b/i,
            fixed: new Map([
                [50, 250_000],
                [100, 500_000],
                [200, 1_000_000],
                [300, 1_500_000],
                [400, 2_000_000],
                [500, 2_500_000],
                [600, 3_000_000],
                [700, 3_500_000],
                [800, 4_000_000],
                [900, 4_500_000],
                [1000, 5_000_000],
                [1100, 5_500_000],
                [1200, 6_000_000]
            ])
        },
        mining: {
            label: 'Mining',
            memo: value => `${value} Mining`,
            aliases: /\b(?:mining|mine(?:\s+stat)?)\b/i,
            fixed: new Map([
                [50, 5_000_000],
                [100, 2_000_000],
                [150, 2_000_000],
                [200, 2_000_000],
                [250, 2_000_000],
                [300, 2_000_000],
                [350, 2_000_000],
                [400, 2_000_000],
                [500, 2_000_000],
                [600, 2_000_000],
                [700, 2_000_000],
                [800, 2_000_000],
                [900, 2_000_000],
                [1000, 10_000_000]
            ]),
            recurring: { start: 1050, step: 50, payout: 5_000_000 }
        },
        begging: {
            label: 'Begging',
            memo: value => `${value} Begging`,
            aliases: /\b(?:beg|begging|beg\s+stat)\b/i,
            fixed: new Map([
                [50, 500_000],
                [100, 1_000_000],
                [200, 2_000_000],
                [300, 3_000_000],
                [500, 5_000_000]
            ])
        }
    };

    function parseMilestoneReply(postId) {
        if (!postId) return null;

        const body = document.getElementById(`post-content-${postId}`);
        if (!body) return null;

        // Preserve native <br> boundaries before reading text. textContent
        // does not reliably represent <br> as a newline, which can collapse
        // separate claims such as:
        //   lvl 1000 - $5,000,000
        //   1600 mining - $5,000,000
        // into one ambiguous string containing two incentive types.
        const readable = body.cloneNode(true);
        readable.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('\n'));
        });

        const text = String(readable.textContent || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '');

        const results = [];

        text.split('\n').forEach(rawLine => {
            const line = rawLine.replace(/\s+/g, ' ').trim();
            if (!line) return;

            const parsed = parseMilestoneLine(line);
            if (parsed) results.push(parsed);
        });

        if (!results.length) return null;

        const amount = results.reduce((sum, item) => sum + item.expectedAmount, 0);
        const memo = results.map(item => item.memo).join(', ').substring(0, 60);
        const corrections = results
            .filter(item =>
                Number.isFinite(item.claimedAmount) &&
                item.claimedAmount !== item.expectedAmount
            )
            .map(item =>
                `${item.memo} ${formatCurrency(item.claimedAmount)} \u2192 ${formatCurrency(item.expectedAmount)}`
            );

        return {
            amount,
            memo,
            corrections,
            items: results
        };
    }

    function parseMilestoneLine(line) {
        const candidates = [];

        Object.entries(MILESTONE_SCHEDULES).forEach(([type, schedule]) => {
            const labelMatch = line.match(schedule.aliases);
            if (!labelMatch) return;

            const labelIndex = labelMatch.index ?? -1;
            if (labelIndex < 0) return;

            let statMatch = null;
            let valueText = '';
            let statEnd = -1;

            // Normal phrasing: "Mining 400", "Drinking: 50.33", "Intel 1500".
            const afterLabel = line.slice(labelIndex + labelMatch[0].length);
            const forward = afterLabel.match(/^\s*:?\s*([\d,]+(?:\.\d+)?)/);
            if (forward) {
                valueText = forward[1];
                statEnd = labelIndex + labelMatch[0].length + forward[0].length;
            } else {
                // Also accept the schedule's native "50 beg" phrasing.
                const beforeLabel = line.slice(0, labelIndex);
                const reverse = beforeLabel.match(/([\d,]+(?:\.\d+)?)\s*$/);
                if (reverse) {
                    valueText = reverse[1];
                    statEnd = labelIndex + labelMatch[0].length;
                }
            }

            if (!valueText) return;

            const reported = Number(valueText.replace(/,/g, ''));
            if (!Number.isFinite(reported)) return;

            const resolved = resolveMilestone(schedule, reported);
            if (!resolved) return;

            const tail = line.slice(statEnd);
            const claimedAmount = parseClaimedPayment(tail);

            candidates.push({
                type,
                reported,
                milestone: resolved.milestone,
                expectedAmount: resolved.payout,
                memo: schedule.memo(resolved.milestone),
                claimedAmount
            });
        });

        // If one line somehow names more than one incentive type, do not guess.
        return candidates.length === 1 ? candidates[0] : null;
    }

    function resolveMilestone(schedule, reported) {
        const fixedCandidates = Array.from(schedule.fixed.keys())
            .filter(value => value <= reported);

        let milestone = fixedCandidates.length
            ? Math.max(...fixedCandidates)
            : null;
        let payout = milestone !== null ? schedule.fixed.get(milestone) : null;

        const recurring = schedule.recurring;
        if (recurring && reported >= recurring.start) {
            const recurringMilestone =
                recurring.start +
                Math.floor((reported - recurring.start) / recurring.step) * recurring.step;

            if (milestone === null || recurringMilestone > milestone) {
                milestone = recurringMilestone;
                payout = recurring.payout;
            }
        }

        return milestone === null || payout === null
            ? null
            : { milestone, payout };
    }

    function parseClaimedPayment(value) {
        const text = String(value || '')
            .replace(/\u00a0/g, ' ')
            .trim();

        if (!text) return null;

        // Explicit currency and suffix forms: $500,000, 500k, 1.25m,
        // 1.5 mil, 2 million, etc.
        const explicit = text.match(
            /(?:[$\u00a3\u20ac\u00a5]\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mil|million|b|bil|billion)\b|[$\u00a3\u20ac\u00a5]\s*(\d[\d,]*(?:\.\d+)?)/i
        );

        if (explicit) {
            const numberText = explicit[1] || explicit[3];
            const suffix = (explicit[2] || '').toLowerCase();
            const numeric = Number(String(numberText).replace(/,/g, ''));
            if (!Number.isFinite(numeric)) return null;

            const multiplier =
                suffix === 'k' ? 1_000 :
                ['m', 'mil', 'million'].includes(suffix) ? 1_000_000 :
                ['b', 'bil', 'billion'].includes(suffix) ? 1_000_000_000 :
                1;

            return Math.round(numeric * multiplier);
        }

        // Bare payout values are accepted only after an obvious separator.
        const bare = text.match(/(?:-|–|—|=)\s*(\d{1,3}(?:,\d{3})+|\d{4,})\b/);
        if (!bare) return null;

        const numeric = Number(bare[1].replace(/,/g, ''));
        return Number.isFinite(numeric) ? numeric : null;
    }

    // Members List snapshots are captured from manual page visits.
    const MEMBER_STAT_CLASS_BY_TYPE = {
        level: 'ts_level',
        begging: 'ts_beg',
        intelligence: 'ts_intel',
        drinking: 'ts_drinking',
        mining: 'ts_mining'
    };

    if (cmd === 'gang' && action === 'list_mem') {
        persistVisibleGangMemberStats();
    }

    if (cmd === 'gathering' && action === 'vpost') {
        initGangThread();
        return;
    }

    if (
        cmd === 'gathering' &&
        action === 'edit' &&
        params.has('post') &&
        params.get('board') === '13'
    ) {
        initGangEditPage();
        return;
    }

    if (cmd === 'gang2' && ['loans', 'loan_add', 'loan_del'].includes(action)) {
        initLoansArea();
    }

    function persistVisibleGangMemberStats() {
        const table = document.getElementById('sortabletable');
        if (!table) return;

        const members = {};
        let count = 0;

        table.querySelectorAll('tbody tr').forEach(row => {
            const checkbox = row.querySelector('input.checkMe[name="players[]"]');
            const profile = row.querySelector('a[href*="cmd=player"][href*="ID="]');
            const hoboId =
                String(checkbox?.value || '').trim() ||
                String(profile?.href.match(/[?&]ID=(\d+)/i)?.[1] || '');

            if (!hoboId) return;

            const stats = {};
            Object.entries(MEMBER_STAT_CLASS_BY_TYPE).forEach(([type, className]) => {
                const cell = row.querySelector(`td.${className}`);
                const raw = String(cell?.textContent || '').trim();

                if (!raw) {
                    stats[type] = null;
                    return;
                }

                const numeric = Number(raw.replace(/,/g, ''));
                stats[type] = Number.isFinite(numeric) ? numeric : null;
            });

            members[hoboId] = stats;
            count++;
        });

        if (!count) return;

        const snapshot = {
            schema: 1,
            capturedAt: Date.now(),
            members
        };

        try {
            localStorage.setItem(MEMBER_STATS_STORAGE_KEY, JSON.stringify(snapshot));
        } catch (err) {
            console.warn('HW GILA: could not persist Gang Members List stats.', err);
        }
    }

    function loadPersistedGangMemberStats() {
        try {
            const snapshot = JSON.parse(
                localStorage.getItem(MEMBER_STATS_STORAGE_KEY) || 'null'
            );

            if (!snapshot || Number(snapshot.schema) !== 1) return null;
            if (!snapshot.members || typeof snapshot.members !== 'object') return null;

            return snapshot;
        } catch {
            return null;
        }
    }

    function formatSnapshotAge(capturedAt) {
        const ts = Number(capturedAt);
        if (!Number.isFinite(ts) || ts <= 0) return '';

        const ageMs = Math.max(0, Date.now() - ts);
        const mins = Math.floor(ageMs / 60_000);

        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;

        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;

        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    async function populateMilestoneValidation(host, hoboId, milestone) {
        if (!host || !milestone?.items?.length) return;

        const snapshot = loadPersistedGangMemberStats();
        host.textContent = '';
        host.className = 'hwgila-milestone-validation';

        if (!snapshot) {
            appendMilestoneValidationLine(
                host,
                'unknown',
                '? No stats saved\nvisit the Members List.'
            );
            return;
        }

        const stats = snapshot.members?.[String(hoboId)] || null;
        const age = formatSnapshotAge(snapshot.capturedAt);
        const sourceNote = age ? ` (${age})` : '';

        if (!stats) {
            appendMilestoneValidationLine(
                host,
                'unknown',
                `? Not in the saved Members List snapshot${sourceNote}.`
            );
            return;
        }

        const itemsByType = new Map();
        milestone.items.forEach(item => {
            if (!itemsByType.has(item.type)) itemsByType.set(item.type, []);
            itemsByType.get(item.type).push(item);
        });

        itemsByType.forEach((items, type) => {
            const current = stats[type];
            const label = MILESTONE_SCHEDULES[type]?.label || type;
            const milestones = items
                .map(item => item.milestone)
                .sort((a, b) => a - b);
            const claimLabel = `${label} ${milestones.join(', ')}`;
            const highest = milestones[milestones.length - 1];

            if (!Number.isFinite(current)) {
                appendMilestoneValidationLine(
                    host,
                    'unknown',
                    `? Invalid: ${claimLabel} — saved ${label} unavailable${sourceNote}`
                );
                return;
            }

            if (current >= highest) {
                appendMilestoneValidationLine(
                    host,
                    'verified',
                    `✓ Verified: ${claimLabel} — saved ${label} ${formatNumber(current)}${sourceNote}`
                );
            } else {
                appendMilestoneValidationLine(
                    host,
                    'failed',
                    `✗ Failed: ${claimLabel} — saved ${label} ${formatNumber(current)}${sourceNote}`
                );
            }
        });
    }

    function appendMilestoneValidationLine(host, status, text) {
        const line = document.createElement('div');
        line.className = `hwgila-milestone-validation-line is-${status}`;
        line.textContent = text;
        host.appendChild(line);
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString();
    }


    function isMilestoneIncentivesThread(threadTitle) {
        return String(threadTitle || '').trim().toLowerCase() === 'milestone incentives';
    }

    function isMiningUnionThread(threadTitle) {
        return String(threadTitle || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase() === '** mining union **';
    }

    function isDrinkTankThread(threadTitle, threadId = '') {
        if (String(threadId || '') === DRINK_TANK_THREAD_ID) return true;

        const normalized = String(threadTitle || '')
            .replace(/[’‘]/g, "'")
            .replace(/[*_]+/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        return normalized.includes("jalu's drink tank") ||
            normalized.includes("jalu' drink tank");
    }

    function getReadablePostText(postId) {
        const body = document.getElementById(`post-content-${postId}`);
        if (!body) return '';

        const readable = body.cloneNode(true);
        readable.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('\n'));
        });

        return String(readable.textContent || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\r/g, '')
            .trim();
    }

    function hasDirectPaidEdit(postId) {
        const body = document.getElementById(`post-content-${postId}`);
        if (!body) return false;

        return Array.from(body.querySelectorAll('i')).some(marker => {
            const boldPaid = Array.from(marker.querySelectorAll('b, strong'))
                .some(node => /^\s*paid\s*$/i.test(node.textContent || ''));
            return boldPaid && /\bedit\s*:\s*paid\b/i.test(marker.textContent || '');
        });
    }

    function getPostLevel(postId) {
        const row = document.getElementById(`tr_post_${postId}`);
        const posterText = String(row?.cells?.[0]?.textContent || '');
        const match = posterText.match(/\bLevel\s*:\s*([\d,]+)/i);
        if (!match) return null;

        const level = Number(match[1].replace(/,/g, ''));
        return Number.isFinite(level) && level >= 0 ? level : null;
    }

    function getPostMonthKey(postId) {
        const row = document.getElementById(`tr_post_${postId}`);
        const stamp = String(row?.cells?.[0]?.querySelector('i')?.textContent || '').trim();
        const match = stamp.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);

        if (match) {
            const month = Number(match[1]);
            let year = Number(match[3]);
            if (year < 100) year += year >= 70 ? 1900 : 2000;
            if (month >= 1 && month <= 12 && year >= 2000) {
                return `${year}-${String(month).padStart(2, '0')}`;
            }
        }

        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function parseLooseInteger(value) {
        const numeric = Number(String(value || '').replace(/[^0-9]/g, ''));
        return Number.isSafeInteger(numeric) ? numeric : null;
    }

    function findDrinkTankQuantity(text, drink) {
        const number = '(\\d{1,4}(?:,\\d{3})*)';
        const alias = drink.aliases.source;
        const flags = drink.aliases.flags.replace('g', '');
        const patterns = [
            new RegExp(`${number}\\s*(?:x|×|\\*)\\s*(?:${alias})`, flags),
            new RegExp(`\\(${number}\\)\\s*(?:${alias})`, flags),
            new RegExp(`${number}\\s+(?:${alias})`, flags),
            new RegExp(`(?:${alias})[\\s\\S]{0,55}?(?:x|×|\\*)\\s*${number}`, flags),
            new RegExp(`(?:${alias})[\\s\\S]{0,35}?\\(${number}\\)`, flags)
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            const quantity = parseLooseInteger(match?.[1]);
            if (quantity !== null && quantity > 0) return quantity;
        }

        // Accommodate posts such as "58455 x 500 = ... For fsg", where the
        // drink name follows the entire calculation. Prefer a recognized
        // monthly tier, then the smaller operand as the likely quantity.
        const operands = Array.from(
            text.matchAll(/([\d,]+)\s*(?:x|×|\*)\s*\$?\s*([\d,]+)/gi)
        );

        for (const match of operands) {
            const values = [parseLooseInteger(match[1]), parseLooseInteger(match[2])]
                .filter(value => value !== null && value > 0);
            const tier = values.find(value => DRINK_TANK_TIERS.includes(value));
            if (tier) return tier;
            if (values.length === 2) return Math.min(...values);
        }

        return null;
    }

    function findDrinkTankLineAmount(text) {
        const number = '(\\d{1,3}(?:(?:,|\\s)\\d{3})+|\\d{4,})';
        const matches = Array.from(
            String(text || '').matchAll(new RegExp(`=\\s*\\$?\\s*${number}`, 'g'))
        );
        const amount = parseLooseInteger(matches.at(-1)?.[1]);
        return amount !== null && amount >= 1_000 ? amount : null;
    }

    function findDrinkTankClaimedAmount(text, lineAmounts = []) {
        const number = '(\\d{1,3}(?:(?:,|\\s)\\d{3})+|\\d{4,})';
        const totalAmounts = Array.from(
            String(text || '').matchAll(
                new RegExp(`(?:^|\\n)\\s*(?:grand\\s+)?total\\b[^\\n\\d$]{0,20}\\$?\\s*${number}`, 'gi')
            )
        )
            .map(match => parseLooseInteger(match[1]))
            .filter(amount => amount !== null && amount >= 1_000);
        const uniqueTotals = Array.from(new Set(totalAmounts));

        if (uniqueTotals.length) {
            return {
                amount: uniqueTotals.length === 1 ? uniqueTotals[0] : null,
                ambiguous: uniqueTotals.length > 1,
                source: 'total'
            };
        }

        const usableLineAmounts = lineAmounts.filter(
            amount => Number.isFinite(amount) && amount >= 1_000
        );
        if (usableLineAmounts.length) {
            return {
                amount: usableLineAmounts.reduce((sum, amount) => sum + amount, 0),
                ambiguous: false,
                source: 'line-sum'
            };
        }

        const amounts = [];
        const patterns = [
            new RegExp(`\\$+\\s*${number}`, 'g'),
            new RegExp(`=\\s*\\$?\\s*${number}`, 'g'),
            new RegExp(`\\bspent\\s*\\$?\\s*${number}`, 'gi')
        ];

        patterns.forEach(pattern => {
            for (const match of text.matchAll(pattern)) {
                const amount = parseLooseInteger(match[1]);
                if (amount !== null && amount >= 1_000) amounts.push(amount);
            }
        });

        const uniqueAmounts = Array.from(new Set(amounts));
        return {
            amount: uniqueAmounts.length ? Math.max(...uniqueAmounts) : null,
            ambiguous: uniqueAmounts.length > 3,
            source: 'fallback'
        };
    }

    function parseDrinkTankItems(text) {
        const lines = String(text || '')
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const items = [];

        lines.forEach(line => {
            const matches = DRINK_TANK_DRINKS.filter(drink => drink.aliases.test(line));
            if (matches.length !== 1) return;

            const drink = matches[0];
            const quantity = findDrinkTankQuantity(line, drink);
            if (!Number.isFinite(quantity) || quantity <= 0) return;

            items.push({
                drink,
                quantity,
                claimedLineAmount: findDrinkTankLineAmount(line)
            });
        });

        if (items.length) return items;

        // Retain support for prose-style, single-drink replies that do not
        // place the calculation on its own line.
        const matches = DRINK_TANK_DRINKS.filter(drink => drink.aliases.test(text));
        if (matches.length !== 1) return [];

        const drink = matches[0];
        const quantity = findDrinkTankQuantity(text, drink);
        if (!Number.isFinite(quantity) || quantity <= 0) return [];

        return [{
            drink,
            quantity,
            claimedLineAmount: findDrinkTankLineAmount(text)
        }];
    }

    function getDrinkTankAllocatedQuantity(thread, hoboId, monthKey, excludeKey = '') {
        return Object.entries(thread?.recipients || {}).reduce((sum, [key, recipient]) => {
            if (key === excludeKey) return sum;
            if (String(recipient?.hoboId || '') !== String(hoboId)) return sum;
            if (recipient?.drinkTank?.monthKey !== monthKey) return sum;

            const quantity = Number(recipient.drinkTank.payableQuantity);
            return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
        }, 0);
    }

    function parseDrinkTankClaim(postId, thread, hoboId, entryKey = '') {
        const text = getReadablePostText(postId);
        if (/\b(?:example|format)\s*:/i.test(text)) return null;

        const items = parseDrinkTankItems(text);
        if (!items.length) return null;

        const level = getPostLevel(postId);
        if (!Number.isFinite(level)) return null;

        const monthKey = getPostMonthKey(postId);
        const allocated = getDrinkTankAllocatedQuantity(
            thread,
            hoboId,
            monthKey,
            entryKey
        );
        const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const requestedMonthlyTotal = allocated + quantity;
        const cap = DRINK_TANK_TIERS.find(limit => requestedMonthlyTotal <= limit) || 800;
        let remaining = Math.max(0, cap - allocated);
        const crudweiserPrice = 257.5 + (level * 2.5);

        const calculatedItems = items.map(item => {
            const payableQuantity = Math.min(item.quantity, remaining);
            remaining -= payableQuantity;

            const unitPrice = Math.round(
                (item.drink.cw * crudweiserPrice) + item.drink.flat
            );
            const bartenderGuideUnitPrice = Math.round(unitPrice * 0.9);

            return {
                ...item,
                payableQuantity,
                unitPrice,
                bartenderGuideUnitPrice,
                calculatedAmount: payableQuantity * unitPrice,
                bartenderGuideCalculatedAmount: payableQuantity * bartenderGuideUnitPrice
            };
        });

        const payableQuantity = calculatedItems.reduce(
            (sum, item) => sum + item.payableQuantity,
            0
        );
        const regularCalculatedAmount = calculatedItems.reduce(
            (sum, item) => sum + item.calculatedAmount,
            0
        );
        const bartenderGuideCalculatedAmount = calculatedItems.reduce(
            (sum, item) => sum + item.bartenderGuideCalculatedAmount,
            0
        );
        const claimed = findDrinkTankClaimedAmount(
            text,
            calculatedItems.map(item => item.claimedLineAmount)
        );
        if (claimed.ambiguous) return null;

        const claimedAmount = claimed.amount;
        const pricingOptions = [
            {
                bartenderGuide: false,
                amount: regularCalculatedAmount,
                difference: Number.isFinite(claimedAmount)
                    ? Math.abs(regularCalculatedAmount - claimedAmount)
                    : Infinity
            },
            {
                bartenderGuide: true,
                amount: bartenderGuideCalculatedAmount,
                difference: Number.isFinite(claimedAmount)
                    ? Math.abs(bartenderGuideCalculatedAmount - claimedAmount)
                    : Infinity
            }
        ].sort((a, b) =>
            (a.difference - b.difference) || (a.amount - b.amount)
        );
        const selectedPricing = pricingOptions[0];
        const calculatedAmount = selectedPricing.amount;
        const amount = Number.isFinite(claimedAmount)
            ? Math.min(claimedAmount, calculatedAmount)
            : calculatedAmount;
        const corrections = [
            `Pricing: ${selectedPricing.bartenderGuide ? 'Bartender Guide (10% off)' : 'No Bartender Guide'} — closest calculation ${formatCurrency(calculatedAmount)} at Level ${formatNumber(level)}.`,
            `Alternate ${selectedPricing.bartenderGuide ? 'without' : 'with'} Bartender Guide: ${formatCurrency(selectedPricing.bartenderGuide ? regularCalculatedAmount : bartenderGuideCalculatedAmount)}.`
        ];

        if (payableQuantity < quantity) {
            corrections.push(
                `Monthly limit: ${formatNumber(payableQuantity)} of ${formatNumber(quantity)} requested drinks remain payable.`
            );
        }

        if (Number.isFinite(claimedAmount) && claimedAmount < calculatedAmount) {
            corrections.push(`Lower posted claim retained: ${formatCurrency(claimedAmount)}.`);
        } else if (Number.isFinite(claimedAmount) && claimedAmount > calculatedAmount) {
            corrections.push(`Posted claim corrected from ${formatCurrency(claimedAmount)}.`);
        }

        return {
            amount,
            memo: calculatedItems
                .filter(item => item.payableQuantity > 0)
                .map(item => `${item.payableQuantity} ${item.drink.memo}`)
                .join(', ')
                .substring(0, 60),
            corrections,
            drinkTank: {
                monthKey,
                drink: calculatedItems.length === 1
                    ? calculatedItems[0].drink.name
                    : 'Mixed',
                quantity,
                payableQuantity,
                level,
                unitPrice: calculatedItems.length === 1
                    ? calculatedItems[0].unitPrice
                    : null,
                calculatedAmount,
                claimedAmount,
                cap,
                bartenderGuide: selectedPricing.bartenderGuide,
                regularCalculatedAmount,
                bartenderGuideCalculatedAmount,
                items: calculatedItems.map(item => ({
                    drink: item.drink.name,
                    memo: item.drink.memo,
                    quantity: item.quantity,
                    payableQuantity: item.payableQuantity,
                    unitPrice: item.unitPrice,
                    bartenderGuideUnitPrice: item.bartenderGuideUnitPrice,
                    calculatedAmount: item.calculatedAmount,
                    bartenderGuideCalculatedAmount: item.bartenderGuideCalculatedAmount,
                    claimedLineAmount: item.claimedLineAmount
                }))
            }
        };
    }

    function applyDrinkTankMetadata(recipient, parsed) {
        if (!recipient || !parsed?.drinkTank) return;
        recipient.drinkTank = { ...parsed.drinkTank };
    }

    function getSavedMemberMiningStat(hoboId) {
        const snapshot = loadPersistedGangMemberStats();
        const value = snapshot?.members?.[String(hoboId)]?.mining;
        return Number.isFinite(value) ? value : null;
    }

    function getMiningUnionPostMonthKey(postId) {
        const row = document.getElementById(`tr_post_${postId}`);
        const stamp = String(row?.cells?.[0]?.querySelector('i')?.textContent || '').trim();
        const match = stamp.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);

        if (match) {
            const month = Number(match[1]);
            let year = Number(match[3]);
            if (year < 100) year += year >= 70 ? 1900 : 2000;
            if (month >= 1 && month <= 12 && year >= 2000) {
                return `${year}-${String(month).padStart(2, '0')}`;
            }
        }

        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function getMiningUnionAllocatedAmount(thread, hoboId, monthKey, excludeKey = '') {
        return Object.entries(thread?.recipients || {}).reduce((sum, [key, recipient]) => {
            if (key === excludeKey) return sum;
            if (String(recipient?.hoboId || '') !== String(hoboId)) return sum;
            if (recipient?.miningUnion !== true) return sum;

            const claimMonth = String(recipient?.miningUnionClaim?.monthKey || '');
            if (claimMonth !== String(monthKey)) return sum;

            return sum + Math.max(0, Number(recipient?.amount) || 0);
        }, 0);
    }

    function getPostReadableText(postId) {
        const body = document.getElementById(`post-content-${postId}`);
        if (!body) return '';

        const readable = body.cloneNode(true);
        readable.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('\n'));
        });

        return String(readable.textContent || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .trim();
    }

    function miningUnionExplosiveClaimRegex(name) {
        const patterns = {
            'Dynamite Stick': 'Dynamite\\s+Sticks?',
            'Bundle of Dynamite': 'Bundles?\\s+of\\s+Dynamite',
            'Bomb': 'Bombs?',
            'Plastic Explosives': 'Plastic\\s+Explosives?',
            'TNT': 'TNT'
        };
        return patterns[name] || String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function parseMiningUnionClaim(postId) {
        const text = getPostReadableText(postId);
        const lower = text.toLowerCase();
        const gear = [];
        const explosives = [];

        MINING_UNION_GEAR.forEach(item => {
            if (lower.includes(item.name.toLowerCase())) {
                gear.push({ name: item.name, cost: item.cost });
            }
        });

        MINING_UNION_EXPLOSIVES.forEach(item => {
            const labelPattern = miningUnionExplosiveClaimRegex(item.name);
            const match = text.match(
                new RegExp(`\\b((?:\\d{1,3}(?:,\\d{3})+)|(?:\\d+(?:\\.\\d+)?))\\s*(k)?\\s*${labelPattern}\\b`, 'i')
            );
            if (!match) return;

            const numeric = Number(match[1].replace(/,/g, ''));
            if (!Number.isFinite(numeric)) return;

            explosives.push({
                name: item.name,
                cost: item.cost,
                quantity: Math.max(0, Math.round(numeric * (match[2] ? 1000 : 1)))
            });
        });

        return { gear, explosives };
    }

    function formatMiningUnionExplosiveQty(name, quantity) {
        const count = Math.max(0, Math.floor(Number(quantity) || 0));
        if (!count || !name) return '';

        const qty = count >= 1000 && count % 1000 === 0
            ? `${count / 1000}k`
            : formatNumber(count);
        const labels = {
            'Dynamite Stick': ['Dynamite Stick', 'Dynamite Sticks'],
            'Bundle of Dynamite': ['Bundle of Dynamite', 'Bundles of Dynamite'],
            'Bomb': ['Bomb', 'Bombs'],
            'Plastic Explosives': ['Plastic Explosives', 'Plastic Explosives'],
            'TNT': ['TNT', 'TNT']
        };
        const pair = labels[name] || [name, `${name}s`];
        return `${qty} ${count === 1 ? pair[0] : pair[1]}`;
    }

    function miningUnionMemo(gear, explosives) {
        const parts = (Array.isArray(gear) ? gear : [])
            .map(item => String(item?.name || '').trim())
            .filter(Boolean);

        (Array.isArray(explosives) ? explosives : []).forEach(item => {
            const text = formatMiningUnionExplosiveQty(item?.name, item?.quantity);
            if (text) parts.push(text);
        });

        return (parts.join(' & ') || 'Mining Union').substring(0, 60);
    }

    function applyMiningUnionMetadata(recipient, details) {
        if (!recipient || !details) return;

        const gear = (Array.isArray(details.gear) ? details.gear : [])
            .map(item => {
                const known = MINING_UNION_GEAR_BY_NAME.get(String(item?.name || '').toLowerCase());
                return known ? { name: known.name, cost: known.cost } : null;
            })
            .filter(Boolean);

        const explosives = (Array.isArray(details.explosives) ? details.explosives : [])
            .map(item => {
                const known = MINING_UNION_EXPLOSIVE_BY_NAME.get(String(item?.name || '').toLowerCase());
                const quantity = Math.max(0, Math.floor(Number(item?.quantity) || 0));
                return known && quantity > 0
                    ? { name: known.name, cost: known.cost, quantity }
                    : null;
            })
            .filter(Boolean);

        recipient.miningUnion = true;
        recipient.miningUnionClaim = {
            gear,
            gearCost: gear.reduce((sum, item) => sum + item.cost, 0),
            explosives,
            explosiveCost: explosives.reduce((sum, item) => sum + item.cost * item.quantity, 0),
            monthlyCap: MINING_UNION_MONTHLY_CAP,
            miningStatAtSave: Number.isFinite(details.miningStat) ? details.miningStat : null,
            monthKey: String(details.monthKey || '')
        };
    }

    function getCompletedMilestonePostIds(thread, hoboId) {
        const used = new Set();

        Object.values(thread?.recipients || {}).forEach(recipient => {
            if (String(recipient?.hoboId || '') !== String(hoboId)) return;
            if (recipient?.status !== 'completed') return;

            (recipient.sourcePostIds || []).forEach(postId => {
                if (postId) used.add(String(postId));
            });

            if (recipient.sourcePostId) used.add(String(recipient.sourcePostId));
        });

        return used;
    }

    function collectMilestoneClaimsForHobo(hoboId, thread = null) {
        const completedPostIds = getCompletedMilestonePostIds(thread, hoboId);
        const claimsByKey = new Map();
        const sourcePostIds = [];

        document.querySelectorAll('tr[id^="tr_post_"]').forEach(postRow => {
            const poster = getPoster(postRow);
            if (!poster || String(poster.id) !== String(hoboId)) return;
            if (completedPostIds.has(String(poster.postId))) return;

            const parsed = parseMilestoneReply(poster.postId);
            if (!parsed?.items?.length) return;

            sourcePostIds.push(String(poster.postId));

            parsed.items.forEach(item => {
                const claimKey = `${item.type}:${item.milestone}`;

                // Identical milestone claims are one-time rewards. Keep one
                // authoritative claim even if it was repeated in another reply.
                if (!claimsByKey.has(claimKey)) {
                    claimsByKey.set(claimKey, {
                        ...item,
                        sourcePostIds: [String(poster.postId)]
                    });
                } else {
                    const existing = claimsByKey.get(claimKey);
                    if (!existing.sourcePostIds.includes(String(poster.postId))) {
                        existing.sourcePostIds.push(String(poster.postId));
                    }

                    // Prefer a concrete claimant amount for audit display when
                    // one occurrence supplied it and the earlier occurrence did not.
                    if (
                        !Number.isFinite(existing.claimedAmount) &&
                        Number.isFinite(item.claimedAmount)
                    ) {
                        existing.claimedAmount = item.claimedAmount;
                    }
                }
            });
        });

        const items = Array.from(claimsByKey.values());
        if (!items.length) return null;

        const typeOrder = [];
        items.forEach(item => {
            if (!typeOrder.includes(item.type)) typeOrder.push(item.type);
        });

        const groupedMemo = typeOrder.map(type => {
            const schedule = MILESTONE_SCHEDULES[type];
            const label = schedule?.label || type;
            const milestones = items
                .filter(item => item.type === type)
                .map(item => item.milestone)
                .sort((a, b) => a - b);

            return `${label} ${milestones.join(', ')}`;
        }).join(', ');

        const amount = items.reduce((sum, item) => sum + item.expectedAmount, 0);
        const corrections = items
            .filter(item =>
                Number.isFinite(item.claimedAmount) &&
                item.claimedAmount !== item.expectedAmount
            )
            .map(item =>
                `${item.memo} ${formatCurrency(item.claimedAmount)} → ${formatCurrency(item.expectedAmount)}`
            );

        return {
            amount,
            memo: groupedMemo.substring(0, 60),
            corrections,
            items,
            sourcePostIds: Array.from(new Set(sourcePostIds))
        };
    }

    function findActiveMilestoneRecipientEntry(thread, hoboId) {
        return Object.entries(thread?.recipients || {}).find(([, recipient]) =>
            String(recipient?.hoboId || '') === String(hoboId) &&
            recipient?.milestoneBatch === true &&
            recipient?.status !== 'completed'
        ) || null;
    }

    function getMilestoneRecipientEntryKey(thread, hoboId, postId) {
        const active = findActiveMilestoneRecipientEntry(thread, hoboId);
        if (active) return active[0];
        return `milestone:${hoboId}:${postId}`;
    }

    function applyMilestoneBatchMetadata(recipient, milestone) {
        if (!recipient || !milestone) return;
        recipient.milestoneBatch = true;
        recipient.sourcePostIds = Array.from(new Set(milestone.sourcePostIds || []));
        recipient.milestoneClaims = milestone.items.map(item => ({
            type: item.type,
            milestone: item.milestone,
            expectedAmount: item.expectedAmount
        }));
    }

    // ---------------------------------------------------------------------
    // Gang Board edit helper
    // ---------------------------------------------------------------------

    function initGangEditPage() {
        const form = document.getElementById('editform');
        const message = document.getElementById('t_message');
        const rtBar = document.getElementById('rtBar');
        if (!form || !message || !rtBar) return;

        injectGangEditStyles();
        injectPaidEditButton(form, message);
        injectEditorPresetSettings(rtBar);
    }

    function getEditorPreset() {
        const data = loadData();
        return String(data.settings?.editorPreset || DEFAULT_EDITOR_PRESET);
    }

    function setEditorPreset(value) {
        const data = loadData();
        if (!data.settings || typeof data.settings !== 'object') data.settings = {};
        data.settings.editorPreset = String(value || '').trim();
        saveData(data);
    }

    function injectPaidEditButton(form, message) {
        if (document.getElementById('hwgila-paid-edit-button')) return;

        const submit = form.querySelector('input[type="submit"][name="button"]');
        const preview = document.getElementById('prevbutt');
        const host = preview?.parentElement || submit?.parentElement;
        if (!host) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'hwgila-paid-edit-button';
        button.textContent = 'Edit: PAID';

        button.addEventListener('click', () => {
            const preset = getEditorPreset();
            if (!preset) return;

            const addition = `\n\n${preset}`;
            const current = message.value;

            if (!current.endsWith(addition)) {
                message.value = current.replace(/\s+$/, '') + addition;
            }

            message.focus();
            message.setSelectionRange(message.value.length, message.value.length);
        });

        if (preview?.nextSibling) {
            host.insertBefore(button, preview.nextSibling);
        } else {
            host.appendChild(button);
        }
    }

    function injectEditorPresetSettings(rtBar) {
        if (document.getElementById('hwgila-editor-settings')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'hwgila-editor-settings';
        button.textContent = '⚙';
        button.setAttribute('aria-label', 'Configure paid edit preset');
        button.addEventListener('click', openEditorPresetDialog);
        rtBar.appendChild(button);
    }

    function openEditorPresetDialog() {
        document.getElementById('hwgila-editor-preset-backdrop')?.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'hwgila-editor-preset-backdrop';
        backdrop.className = 'hwgila-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'hwgila-dialog';

        const heading = document.createElement('div');
        heading.className = 'hwgila-dialog-heading';
        heading.textContent = 'Edit: PAID Preset';
        dialog.appendChild(heading);

        const form = document.createElement('div');
        form.className = 'hwgila-editor-preset-form';

        const label = document.createElement('label');
        label.textContent = 'Append:';

        const input = document.createElement('textarea');
        input.rows = 3;
        input.value = getEditorPreset();

        label.appendChild(input);
        form.appendChild(label);
        dialog.appendChild(form);

        const actions = document.createElement('div');
        actions.className = 'hwgila-dialog-actions';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.className = 'hwgila-dialog-button hwgila-dialog-cancel';
        cancel.addEventListener('click', () => backdrop.remove());

        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save';
        save.className = 'hwgila-dialog-button hwgila-dialog-save';
        save.addEventListener('click', () => {
            setEditorPreset(input.value);
            backdrop.remove();
        });

        actions.append(cancel, save);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        input.focus();
        input.select();

        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) backdrop.remove();
        });

        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                backdrop.remove();
                return;
            }

            if (event.key === 'Enter') {
                const focused = document.activeElement;
                if (focused?.classList.contains('hwgila-dialog-cancel')) return;
                if (focused === input) return;

                event.preventDefault();
                save.click();
            }
        });
    }

    function injectGangEditStyles() {
        if (document.getElementById('hwgila-edit-styles')) return;

        const style = document.createElement('style');
        style.id = 'hwgila-edit-styles';
        style.textContent = `
            #hwgila-paid-edit-button {
                margin-left: 12px;
                min-width: 96px;
                height: 23px;
                padding: 2px 10px;
                border: 1px solid #aaa;
                border-radius: 2px;
                background: #ddd;
                color: #555;
                font: bold 11px Tahoma, Arial, sans-serif;
                cursor: pointer;
            }
            #hwgila-paid-edit-button:hover,
            #hwgila-paid-edit-button:focus-visible {
                border-color: #336699;
                box-shadow: 0 0 0 2px rgba(51, 102, 153, 0.22);
                outline: none;
            }
            #hwgila-editor-settings {
                position: absolute;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 24px;
                height: 20px;
                padding: 0;
                border: 1px solid #aaa;
                border-radius: 2px;
                background: #e7e7e7;
                color: #444;
                font: 14px/18px Tahoma, Arial, sans-serif;
                cursor: pointer;
            }
            #hwgila-editor-settings:hover,
            #hwgila-editor-settings:focus-visible {
                border-color: #336699;
                box-shadow: 0 0 0 2px rgba(51, 102, 153, 0.22);
                outline: none;
            }
            #hwgila-editor-preset-backdrop.hwgila-dialog-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99998;
                background: rgba(0, 0, 0, 0.35);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog {
                width: min(520px, calc(100vw - 30px));
                background: #fff;
                border: 2px solid #336699;
                border-radius: 5px;
                box-shadow: 0 5px 18px rgba(0, 0, 0, 0.35);
                padding: 12px;
                color: #222;
                font: 12px/1.35 Tahoma, Arial, sans-serif;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog-heading {
                font-size: 15px;
                font-weight: bold;
                padding-bottom: 6px;
                margin-bottom: 8px;
                border-bottom: 1px solid #99b9d8;
            }
            .hwgila-editor-preset-form label {
                display: grid;
                grid-template-columns: 60px 1fr;
                align-items: start;
                gap: 8px;
                font-weight: bold;
            }
            .hwgila-editor-preset-form textarea {
                width: 100%;
                box-sizing: border-box;
                resize: vertical;
                padding: 5px 7px;
                border: 1px solid #aaa;
                border-radius: 3px;
                font: inherit;
            }
            .hwgila-editor-preset-form textarea:hover,
            .hwgila-editor-preset-form textarea:focus-visible {
                border-color: #336699;
                box-shadow: 0 0 0 2px rgba(51, 102, 153, 0.22);
                outline: none;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 12px;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog-button {
                padding: 5px 11px;
                border-radius: 3px;
                cursor: pointer;
                font: bold 11px Tahoma, Arial, sans-serif;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog-cancel {
                border: 1px solid #aaa;
                background: #eee;
                color: #333;
            }
            #hwgila-editor-preset-backdrop .hwgila-dialog-save {
                border: 1px solid #6699cc;
                background: #e6f3ff;
                color: #234;
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // Gang Board thread
    // ---------------------------------------------------------------------

    function initGangThread() {
        const topOps = document.getElementById('topOps');
        const isStaff = topOps && (
            topOps.querySelector('a[title="Toggle Lock"]') ||
            topOps.querySelector('a[title="Delete"]')
        );
        if (!isStaff) return;

        const threadTitle = getThreadTitle();
        const threadId = getThreadId();
        if (!threadTitle) return;

        injectThreadStyles();
        injectSaveRepliersButton(threadTitle, threadId);
        injectPosterAddButtons(threadTitle, threadId);
    }

    function getThreadTitle() {
        const titleEl = document.getElementById('thread-topic');
        if (!titleEl) return '';

        const plain = titleEl.querySelector('.plaintopic');
        const title = (plain ? plain.textContent : titleEl.textContent)
            .replace(/^\s*Topic:\s*/i, '')
            .trim();

        return title;
    }

    function getThreadId() {
        const linkId = document.getElementById('linkid')?.textContent.trim();
        if (/^\d+$/.test(linkId || '')) return linkId;

        const post = params.get('post') || '';
        return /^\d+$/.test(post) ? post : '';
    }

    function getPoster(postRow) {
        const posterCell = postRow.cells?.[0] || postRow.querySelector('td');
        if (!posterCell) return null;

        const link = posterCell.querySelector('a[href*="cmd=player"][href*="ID="]');
        if (!link) return null;

        const match = link.href.match(/[?&]ID=(\d+)/i);
        if (!match) return null;

        const nameNode = link.querySelector('.player-name') || link;
        const name = nameNode.textContent.trim();
        if (!name) return null;

        const postId = (postRow.id || '').replace(/^tr_post_/, '') || '';

        return {
            id: match[1],
            name,
            postId,
            cell: posterCell,
            row: postRow
        };
    }

    function collectUniquePosters() {
        const unique = new Map();

        document.querySelectorAll('tr[id^="tr_post_"]').forEach(postRow => {
            const poster = getPoster(postRow);
            if (poster && !hasDirectPaidEdit(poster.postId) && !unique.has(poster.id)) {
                unique.set(poster.id, poster);
            }
        });

        return unique;
    }

    function injectSaveRepliersButton(threadTitle, threadId) {
        // Mining Union claims are itemized and eligibility-gated. They must be
        // reviewed per reply so the generic bulk amount/memo path cannot
        // bypass the monthly cap or explosives restrictions.
        if (isMiningUnionThread(threadTitle) || isDrinkTankThread(threadTitle, threadId)) return;

        const candidates = Array.from(
            document.querySelectorAll('b, strong, th, td, div, font, span')
        ).filter(el => el.textContent.trim() === 'Now Viewing Topic & Replies');

        if (!candidates.length) return;

        const anchor = candidates[candidates.length - 1];
        const table = anchor.closest('table');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hwgila-save-repliers';
        button.textContent = 'Save Unique Repliers';

        button.addEventListener('click', () => {
            openBulkRepliersDialog({
                threadTitle,
                threadId,
                onSaved: ({ total, added }) => {
                    refreshPosterButtons(threadTitle);
                    const original = button.textContent;
                    button.textContent = `Saved ${total} (${added} new)`;
                    setTimeout(() => { button.textContent = original; }, 2500);
                }
            });
        });

        if (table?.parentNode) {
            table.parentNode.insertBefore(button, table);
        } else {
            anchor.parentNode?.insertBefore(button, anchor);
        }
    }

    function injectPosterAddButtons(threadTitle, threadId) {
        document.querySelectorAll('tr[id^="tr_post_"]').forEach(postRow => {
            const poster = getPoster(postRow);
            if (!poster || poster.cell.querySelector('.hwgila-add-recipient')) return;

            const controls = document.createElement('div');
            controls.className = 'hwgila-poster-controls';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'hwgila-add-recipient';
            button.dataset.hoboId = poster.id;
            button.dataset.postId = poster.postId;
            button.dataset.threadTitle = threadTitle;

            setPosterButtonState(button, threadTitle, poster.id, poster.postId);

            button.addEventListener('click', () => {
                // A completed payout is terminal only for the exact reply that
                // produced it. The inert Completed marker must not reopen it.
                if (button.dataset.completed === '1') return;

                const data = loadData();
                const thread = ensureThread(data, threadTitle, threadId);
                const entryKey = isMilestoneIncentivesThread(threadTitle)
                    ? getMilestoneRecipientEntryKey(thread, poster.id, poster.postId)
                    : `post:${poster.postId}`;
                const existing = thread.recipients[entryKey] || null;

                openRecipientDetailsDialog({
                    threadTitle,
                    threadId,
                    hoboId: poster.id,
                    postId: poster.postId,
                    entryKey,
                    recipientName: poster.name,
                    existingRecipient: existing,
                    onSaved: wasAdded => {
                        setPosterButtonState(button, threadTitle, poster.id, poster.postId);
                        if (wasAdded) {
                            button.textContent = 'Added';
                            setTimeout(() => setPosterButtonState(button, threadTitle, poster.id, poster.postId), 1200);
                        }
                    }
                });
            });

            controls.appendChild(button);
            poster.cell.appendChild(controls);
        });
    }

    function setPosterButtonState(button, threadTitle, hoboId, postId) {
        const data = loadData();
        const thread = data.threads?.[threadTitle];
        const postKey = `post:${postId}`;
        let recipient = thread?.recipients?.[postKey] || null;

        if (!recipient && thread && isMilestoneIncentivesThread(threadTitle)) {
            recipient = Object.values(thread.recipients || {}).find(rec =>
                String(rec?.hoboId || '') === String(hoboId) &&
                (
                    (Array.isArray(rec?.sourcePostIds) && rec.sourcePostIds.map(String).includes(String(postId))) ||
                    String(rec?.sourcePostId || '') === String(postId)
                )
            ) || null;
        }

        // Legacy/bulk entries can be attached to the first reply from that hobo.
        if (!recipient && thread) {
            recipient = Object.values(thread.recipients || {}).find(rec =>
                String(rec?.hoboId || '') === String(hoboId) &&
                String(rec?.sourcePostId || '') === String(postId)
            ) || null;
        }

        delete button.dataset.completed;
        button.disabled = false;

        if (recipient?.status === 'completed' || hasDirectPaidEdit(postId)) {
            button.textContent = 'Done ✓';
            button.classList.add('is-added', 'is-completed');
            button.dataset.completed = '1';
            button.disabled = true;
            return;
        }

        if (recipient) {
            button.textContent = 'On List';
            button.classList.add('is-added');
            button.classList.remove('is-completed');
        } else {
            button.textContent = 'Pay Hobo';
            button.classList.remove('is-added', 'is-completed');
        }
    }

    function refreshPosterButtons(threadTitle) {
        document.querySelectorAll('.hwgila-add-recipient').forEach(button => {
            setPosterButtonState(
                button,
                threadTitle,
                button.dataset.hoboId,
                button.dataset.postId
            );
        });
    }

    function openBulkRepliersDialog({ threadTitle, threadId, onSaved }) {
        document.getElementById('hwgila-recipient-dialog-backdrop')?.remove();

        const data = loadData();
        const thread = ensureThread(data, threadTitle, threadId);
        const posters = collectUniquePosters();

        const backdrop = document.createElement('div');
        backdrop.id = 'hwgila-recipient-dialog-backdrop';
        backdrop.className = 'hwgila-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'hwgila-dialog';

        const heading = document.createElement('div');
        heading.className = 'hwgila-dialog-heading';
        heading.textContent = 'Save Unique';
        dialog.appendChild(heading);

        const who = document.createElement('div');
        who.className = 'hwgila-dialog-recipient';
        who.textContent = `${threadTitle} — ${posters.size} unique replier${posters.size === 1 ? '' : 's'}`;
        dialog.appendChild(who);

        const form = document.createElement('div');
        form.className = 'hwgila-dialog-form';

        const amountLabel = document.createElement('label');
        amountLabel.textContent = 'Amount:';
        const amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.inputMode = 'decimal';
        amountInput.value = thread.payout?.amount ? String(thread.payout.amount) : '';
        amountInput.placeholder = 'e.g. 1,500,000';
        wireCurrencyInput(amountInput);
        amountLabel.appendChild(amountInput);
        form.appendChild(amountLabel);

        const memoLabel = document.createElement('label');
        memoLabel.textContent = 'Memo:';
        const memoInput = document.createElement('input');
        memoInput.type = 'text';
        memoInput.maxLength = 60;
        memoInput.value = String(thread.payout?.memo || threadTitle).substring(0, 60);
        memoLabel.appendChild(memoInput);
        form.appendChild(memoLabel);

        dialog.appendChild(form);

        const actions = document.createElement('div');
        actions.className = 'hwgila-dialog-actions';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.className = 'hwgila-dialog-button hwgila-dialog-cancel';
        cancel.addEventListener('click', () => backdrop.remove());

        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save';
        save.className = 'hwgila-dialog-button hwgila-dialog-save';
        save.addEventListener('click', () => {
            const nextData = loadData();
            const nextThread = ensureThread(nextData, threadTitle, threadId);
            nextThread.payout.amount = String(normalizeAmount(amountInput.value) || '');
            nextThread.payout.memo = memoInput.value.trim().substring(0, 60) || threadTitle.substring(0, 60);

            let added = 0;
            posters.forEach(poster => {
                if (isMilestoneIncentivesThread(threadTitle)) {
                    const milestone = collectMilestoneClaimsForHobo(poster.id, nextThread);
                    if (!milestone) return;

                    const entryKey = getMilestoneRecipientEntryKey(
                        nextThread,
                        poster.id,
                        milestone.sourcePostIds[0] || poster.postId
                    );

                    const existing = nextThread.recipients[entryKey] || null;
                    const result = addRecipient(
                        nextThread,
                        poster.id,
                        poster.name,
                        existing ? null : {
                            amount: milestone.amount,
                            memo: milestone.memo
                        },
                        {
                            sourcePostId: milestone.sourcePostIds[0] || poster.postId,
                            key: entryKey
                        }
                    );

                    const savedRecipient = nextThread.recipients[entryKey];
                    if (savedRecipient && !existing) {
                        savedRecipient.amount = milestone.amount;
                        savedRecipient.memo = milestone.memo;
                    }
                    applyMilestoneBatchMetadata(savedRecipient, milestone);

                    if (result.added) added++;
                    return;
                }

                const result = addRecipient(nextThread, poster.id, poster.name, null, {
                    sourcePostId: poster.postId,
                    key: `post:${poster.postId}`
                });
                if (result.added) added++;
            });

            saveData(nextData);
            backdrop.remove();
            if (typeof onSaved === 'function') onSaved({ total: posters.size, added });
        });

        actions.appendChild(cancel);
        actions.appendChild(save);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        amountInput.focus();
        amountInput.select();

        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) backdrop.remove();
        });

        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                backdrop.remove();
                return;
            }

            if (event.key === 'Enter') {
                const focused = document.activeElement;
                if (focused?.classList.contains('hwgila-dialog-cancel')) return;

                event.preventDefault();
                save.click();
            }
        });
    }

    function openMiningUnionRecipientDetailsDialog({ threadTitle, threadId, hoboId, postId, entryKey, recipientName, existingRecipient, onSaved }) {
        document.getElementById('hwgila-recipient-dialog-backdrop')?.remove();

        const data = loadData();
        const thread = ensureThread(data, threadTitle, threadId);
        const recipient = existingRecipient || thread.recipients[entryKey] || null;
        const parsed = parseMiningUnionClaim(postId);
        const savedClaim = recipient?.miningUnionClaim || null;
        const miningStat = getSavedMemberMiningStat(hoboId);
        const explosivesEligible = Number.isFinite(miningStat) && miningStat >= MINING_UNION_EXPLOSIVES_MIN_STAT;
        const monthKey = String(savedClaim?.monthKey || getMiningUnionPostMonthKey(postId));
        const alreadyAllocated = getMiningUnionAllocatedAmount(thread, hoboId, monthKey, entryKey);
        const availableCap = Math.max(0, MINING_UNION_MONTHLY_CAP - alreadyAllocated);

        const initialGearNames = new Set(
            (Array.isArray(savedClaim?.gear) ? savedClaim.gear : parsed.gear)
                .map(item => String(item?.name || ''))
                .filter(Boolean)
        );

        const initialExplosives = new Map();
        const savedExplosives = Array.isArray(savedClaim?.explosives)
            ? savedClaim.explosives
            : savedClaim?.explosiveName
                ? [{
                    name: savedClaim.explosiveName,
                    quantity: savedClaim.explosiveQty || 0
                }]
                : parsed.explosives;
        (savedExplosives || []).forEach(item => {
            const known = MINING_UNION_EXPLOSIVE_BY_NAME.get(String(item?.name || '').toLowerCase());
            if (known) initialExplosives.set(known.name, Math.max(0, Math.floor(Number(item?.quantity) || 0)));
        });

        const backdrop = document.createElement('div');
        backdrop.id = 'hwgila-recipient-dialog-backdrop';
        backdrop.className = 'hwgila-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'hwgila-dialog hwgila-mining-union-dialog';

        const heading = document.createElement('div');
        heading.className = 'hwgila-dialog-heading';
        heading.textContent = recipient ? 'Edit Mining Union Claim' : 'Mining Union Claim';
        dialog.appendChild(heading);

        const who = document.createElement('div');
        who.className = 'hwgila-dialog-recipient';
        who.textContent = `${recipientName || recipient?.recipient || `#${hoboId}`} — ${threadTitle}`;
        dialog.appendChild(who);

        const form = document.createElement('div');
        form.className = 'hwgila-dialog-form';

        const gearField = document.createElement('fieldset');
        gearField.className = 'hwgila-mining-union-gear';
        const gearLegend = document.createElement('legend');
        gearLegend.textContent = 'Mining Gear';
        gearField.appendChild(gearLegend);

        const gearInputs = new Map();
        MINING_UNION_GEAR.forEach(item => {
            const row = document.createElement('label');
            row.className = 'hwgila-mining-union-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = initialGearNames.has(item.name);
            const text = document.createElement('span');
            text.textContent = `${item.name} — ${formatCurrency(item.cost)}`;
            row.append(checkbox, text);
            gearField.appendChild(row);
            gearInputs.set(item.name, checkbox);
        });
        form.appendChild(gearField);

        const explosiveField = document.createElement('fieldset');
        explosiveField.className = 'hwgila-mining-union-gear hwgila-mining-union-explosives';
        const explosiveLegend = document.createElement('legend');
        explosiveLegend.textContent = 'Explosives';
        explosiveField.appendChild(explosiveLegend);

        const explosiveInputs = new Map();
        MINING_UNION_EXPLOSIVES.forEach(item => {
            const row = document.createElement('label');
            row.className = 'hwgila-mining-union-explosive-item';
            const name = document.createElement('span');
            name.textContent = `${item.name} — ${formatCurrency(item.cost)} each`;
            const quantity = document.createElement('input');
            quantity.type = 'number';
            quantity.inputMode = 'numeric';
            quantity.min = '0';
            quantity.step = '1';
            quantity.value = explosivesEligible
                ? String(initialExplosives.get(item.name) || 0)
                : '0';
            quantity.disabled = !explosivesEligible;
            row.append(name, quantity);
            explosiveField.appendChild(row);
            explosiveInputs.set(item.name, quantity);
        });
        form.appendChild(explosiveField);

        const amountLabel = document.createElement('label');
        amountLabel.textContent = 'Payout:';
        const amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.readOnly = true;
        amountInput.tabIndex = -1;
        amountLabel.appendChild(amountInput);
        form.appendChild(amountLabel);

        const memoLabel = document.createElement('label');
        memoLabel.textContent = 'Memo:';
        const memoInput = document.createElement('input');
        memoInput.type = 'text';
        memoInput.maxLength = 60;
        memoInput.readOnly = true;
        memoInput.tabIndex = -1;
        memoLabel.appendChild(memoInput);
        form.appendChild(memoLabel);

        const validation = document.createElement('div');
        validation.className = 'hwgila-mining-union-validation';
        form.appendChild(validation);

        dialog.appendChild(form);

        const actions = document.createElement('div');
        actions.className = 'hwgila-dialog-actions hwgila-dialog-actions-split';
        const leftActions = document.createElement('div');
        leftActions.className = 'hwgila-dialog-actions-left';
        const rightActions = document.createElement('div');
        rightActions.className = 'hwgila-dialog-actions-right';

        let computed = null;
        let complete = null;

        const selectedGear = () => MINING_UNION_GEAR.filter(item => gearInputs.get(item.name)?.checked);
        const selectedExplosives = () => MINING_UNION_EXPLOSIVES.map(item => ({
            name: item.name,
            cost: item.cost,
            quantity: explosivesEligible
                ? Math.max(0, Math.floor(Number(explosiveInputs.get(item.name)?.value) || 0))
                : 0
        })).filter(item => item.quantity > 0);

        const recompute = () => {
            const gear = selectedGear();
            const explosives = selectedExplosives();
            const gearCost = gear.reduce((sum, item) => sum + item.cost, 0);
            const explosiveCost = explosives.reduce((sum, item) => sum + item.cost * item.quantity, 0);
            const total = gearCost + explosiveCost;
            const validCap = total <= availableCap;
            const validExplosives = explosives.length === 0 || explosivesEligible;
            const validClaim = total > 0 && validCap && validExplosives;

            MINING_UNION_EXPLOSIVES.forEach(item => {
                const input = explosiveInputs.get(item.name);
                if (!input) return;
                input.max = String(Math.floor(Math.max(0, availableCap - gearCost) / item.cost));
            });

            amountInput.value = formatCurrency(total);
            memoInput.value = miningUnionMemo(gear, explosives);

            validation.textContent = '';
            const addLine = (status, text) => {
                const line = document.createElement('div');
                line.className = `hwgila-milestone-validation-line is-${status}`;
                line.textContent = text;
                validation.appendChild(line);
            };

            addLine(
                validCap ? 'verified' : 'failed',
                `${validCap ? '✓' : '✗'} ${monthKey} allowance: ${formatCurrency(total)} current + ${formatCurrency(alreadyAllocated)} saved / ${formatCurrency(MINING_UNION_MONTHLY_CAP)}`
            );

            if (Number.isFinite(miningStat)) {
                addLine(
                    explosivesEligible ? 'verified' : 'unknown',
                    `${explosivesEligible ? '✓' : '•'} Saved Mining: ${formatNumber(miningStat)} — ${explosivesEligible ? 'explosives eligible' : 'equipment only below 150'}`
                );
            } else {
                addLine(
                    'unknown',
                    '? Saved Mining unavailable — explosives disabled; equipment-only claims remain possible.'
                );
            }

            computed = {
                gear,
                explosives,
                amount: total,
                memo: memoInput.value,
                miningStat,
                monthKey,
                valid: validClaim
            };

            save.disabled = !validClaim;
            if (complete) complete.disabled = !validClaim;
        };

        const persist = status => {
            recompute();
            if (!computed?.valid) return;

            const nextData = loadData();
            const nextThread = ensureThread(nextData, threadTitle, threadId);
            const wasAdded = !nextThread.recipients[entryKey];

            addRecipient(nextThread, hoboId, recipientName, {
                amount: computed.amount,
                memo: computed.memo
            }, { sourcePostId: postId, key: entryKey });

            const savedRecipient = nextThread.recipients[entryKey];
            applyMiningUnionMetadata(savedRecipient, computed);

            if (status === 'completed') {
                savedRecipient.status = 'completed';
                savedRecipient.completedAt = Date.now();
                savedRecipient.nativeLoanId = null;
                delete savedRecipient.pendingBind;
            }

            saveData(nextData);
            backdrop.remove();
            if (typeof onSaved === 'function') onSaved(wasAdded);
        };

        if (recipient?.status !== 'completed') {
            complete = document.createElement('button');
            complete.type = 'button';
            complete.textContent = 'Mark Completed';
            complete.className = 'hwgila-dialog-button hwgila-dialog-complete';
            complete.addEventListener('click', () => persist('completed'));
            leftActions.appendChild(complete);
        }

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.className = 'hwgila-dialog-button hwgila-dialog-cancel';
        cancel.addEventListener('click', () => backdrop.remove());

        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = recipient ? 'Save' : 'Add';
        save.className = 'hwgila-dialog-button hwgila-dialog-save';
        save.addEventListener('click', () => persist('pending'));

        rightActions.append(cancel, save);
        actions.append(leftActions, rightActions);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        gearInputs.forEach(input => input.addEventListener('change', recompute));
        explosiveInputs.forEach(input => input.addEventListener('input', recompute));

        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) backdrop.remove();
        });

        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                backdrop.remove();
                return;
            }

            if (event.key === 'Enter') {
                const focused = document.activeElement;
                if (
                    focused?.classList.contains('hwgila-dialog-complete') ||
                    focused?.classList.contains('hwgila-dialog-cancel')
                ) return;

                event.preventDefault();
                if (!save.disabled) save.click();
            }
        });

        recompute();
        const populatedExplosive = [...explosiveInputs.values()].find(input => Number(input.value) > 0);
        if (explosivesEligible && populatedExplosive) {
            populatedExplosive.focus();
            populatedExplosive.select();
        } else {
            gearInputs.values().next().value?.focus();
        }
    }

    function openRecipientDetailsDialog({ threadTitle, threadId, hoboId, postId, entryKey, recipientName, existingRecipient, onSaved }) {
        if (isMiningUnionThread(threadTitle)) {
            openMiningUnionRecipientDetailsDialog({ threadTitle, threadId, hoboId, postId, entryKey, recipientName, existingRecipient, onSaved });
            return;
        }

        document.getElementById('hwgila-recipient-dialog-backdrop')?.remove();

        const data = loadData();
        const thread = ensureThread(data, threadTitle, threadId);
        const recipient = existingRecipient || thread.recipients[entryKey] || null;

        const inheritedAmount = String(thread.payout?.amount || '').replace(/[^0-9]/g, '');
        const inheritedMemo = String(thread.payout?.memo ?? threadTitle).substring(0, 60);
        const drinkTank = isDrinkTankThread(threadTitle, threadId)
            ? parseDrinkTankClaim(postId, thread, hoboId, entryKey)
            : null;
        const milestone = isMilestoneIncentivesThread(threadTitle)
            ? collectMilestoneClaimsForHobo(hoboId, thread)
            : drinkTank
                ? null
                : parseMilestoneReply(postId);
        const automatic = drinkTank || milestone;
        const amountValue = recipient?.amount !== null && recipient?.amount !== undefined
            ? String(recipient.amount)
            : automatic?.amount !== null && automatic?.amount !== undefined
                ? String(automatic.amount)
                : inheritedAmount;
        const memoValue = recipient?.memo !== null && recipient?.memo !== undefined
            ? String(recipient.memo)
            : automatic?.memo
                ? String(automatic.memo)
                : inheritedMemo;

        const backdrop = document.createElement('div');
        backdrop.id = 'hwgila-recipient-dialog-backdrop';
        backdrop.className = 'hwgila-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'hwgila-dialog';

        const heading = document.createElement('div');
        heading.className = 'hwgila-dialog-heading';
        heading.textContent = recipient ? 'Edit Payment Details' : 'Add Payment Recipient';
        dialog.appendChild(heading);

        const who = document.createElement('div');
        who.className = 'hwgila-dialog-recipient';
        who.textContent = `${recipientName || recipient?.recipient || `#${hoboId}`} — ${threadTitle}`;
        dialog.appendChild(who);

        const form = document.createElement('div');
        form.className = 'hwgila-dialog-form';

        const amountLabel = document.createElement('label');
        amountLabel.textContent = 'Amount:';
        const amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.inputMode = 'numeric';
        amountInput.value = amountValue;
        amountInput.placeholder = '$1,500,000';
        wireCurrencyInput(amountInput);
        amountLabel.appendChild(amountInput);
        form.appendChild(amountLabel);

        if (
            recipient?.amount === null || recipient?.amount === undefined
        ) {
            (automatic?.corrections || []).forEach(noteText => {
                const correction = document.createElement('div');
                correction.className = 'hwgila-milestone-correction';
                correction.textContent = noteText;
                form.appendChild(correction);
            });

            if (isDrinkTankThread(threadTitle, threadId) && !drinkTank) {
                const warning = document.createElement('div');
                warning.className = 'hwgila-milestone-validation-line is-unknown hwgila-drink-tank-warning';
                warning.textContent = '? No supported Drink Tank claim was found in this reply.';
                form.appendChild(warning);
            }
        }

        const memoLabel = document.createElement('label');
        memoLabel.textContent = 'Memo:';
        const memoInput = document.createElement('input');
        memoInput.type = 'text';
        memoInput.maxLength = 60;
        memoInput.value = memoValue;
        memoLabel.appendChild(memoInput);
        form.appendChild(memoLabel);

        if (milestone?.items?.length) {
            const validation = document.createElement('div');
            validation.className = 'hwgila-milestone-validation is-checking';
            validation.textContent = 'Checking saved stats...';
            form.appendChild(validation);
            populateMilestoneValidation(validation, hoboId, milestone);
        }

        dialog.appendChild(form);

        const actions = document.createElement('div');
        actions.className = 'hwgila-dialog-actions hwgila-dialog-actions-split';

        const leftActions = document.createElement('div');
        leftActions.className = 'hwgila-dialog-actions-left';

        const rightActions = document.createElement('div');
        rightActions.className = 'hwgila-dialog-actions-right';

        if (recipient?.status !== 'completed') {
            const complete = document.createElement('button');
            complete.type = 'button';
            complete.textContent = 'Mark Completed';
            complete.className = 'hwgila-dialog-button hwgila-dialog-complete';
            complete.addEventListener('click', () => {
                const nextData = loadData();
                const nextThread = ensureThread(nextData, threadTitle, threadId);
                const wasAdded = !nextThread.recipients[entryKey];

                addRecipient(nextThread, hoboId, recipientName, {
                    amount: amountInput.value,
                    memo: memoInput.value
                }, { sourcePostId: postId, key: entryKey });

                const savedRecipient = nextThread.recipients[entryKey];
                if (isMilestoneIncentivesThread(threadTitle) && milestone) {
                    applyMilestoneBatchMetadata(savedRecipient, milestone);
                }
                if (drinkTank) applyDrinkTankMetadata(savedRecipient, drinkTank);
                savedRecipient.status = 'completed';
                savedRecipient.completedAt = Date.now();
                savedRecipient.nativeLoanId = null;
                delete savedRecipient.pendingBind;

                saveData(nextData);
                backdrop.remove();
                if (typeof onSaved === 'function') onSaved(wasAdded);
            });
            leftActions.appendChild(complete);
        }

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.className = 'hwgila-dialog-button hwgila-dialog-cancel';
        cancel.addEventListener('click', () => backdrop.remove());

        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = recipient ? 'Save' : 'Add';
        save.className = 'hwgila-dialog-button hwgila-dialog-save';
        save.addEventListener('click', () => {
            const nextData = loadData();
            const nextThread = ensureThread(nextData, threadTitle, threadId);
            const wasAdded = !nextThread.recipients[entryKey];

            addRecipient(nextThread, hoboId, recipientName, {
                amount: amountInput.value,
                memo: memoInput.value
            }, { sourcePostId: postId, key: entryKey });

            if (isMilestoneIncentivesThread(threadTitle) && milestone) {
                applyMilestoneBatchMetadata(nextThread.recipients[entryKey], milestone);
            }
            if (drinkTank) applyDrinkTankMetadata(nextThread.recipients[entryKey], drinkTank);

            saveData(nextData);
            backdrop.remove();
            if (typeof onSaved === 'function') onSaved(wasAdded);
        });

        rightActions.appendChild(cancel);
        rightActions.appendChild(save);
        actions.appendChild(leftActions);
        actions.appendChild(rightActions);
        dialog.appendChild(actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);

        amountInput.focus();
        amountInput.select();

        backdrop.addEventListener('mousedown', event => {
            if (event.target === backdrop) backdrop.remove();
        });

        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                backdrop.remove();
                return;
            }

            if (event.key === 'Enter') {
                const focused = document.activeElement;
                const preserveFocusedAction =
                    focused?.classList.contains('hwgila-dialog-complete') ||
                    focused?.classList.contains('hwgila-dialog-cancel');

                if (preserveFocusedAction) return;

                event.preventDefault();
                save.click();
            }
        });
    }

    function injectThreadStyles() {
        if (document.getElementById('hwgila-thread-styles')) return;

        const style = document.createElement('style');
        style.id = 'hwgila-thread-styles';
        style.textContent = `
            .hwgila-save-repliers,
            .hwgila-add-recipient {
                color: #333;
                background: #eee;
                border: 1px solid #aaa;
                border-radius: 3px;
                cursor: pointer;
                font-family: Tahoma, Arial, sans-serif;
                font-weight: bold;
            }
            .hwgila-save-repliers {
                display: block;
                margin: 0 0 8px;
                padding: 5px 12px;
                font-size: 11px;
            }
            .hwgila-poster-controls {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 3px;
                margin: 8px auto 3px;
            }
            .hwgila-add-recipient {
                display: block;
                margin: 0;
                padding: 3px 7px;
                font-size: 10px;
            }
            .hwgila-add-recipient.is-added {
                background: #e6ffe6;
                border-color: #9dcc9d;
            }
            .hwgila-add-recipient.is-completed,
            .hwgila-add-recipient.is-completed:disabled {
                background: #e6ffe6;
                border-color: #9dcc9d;
                color: #333;
                opacity: 1;
                cursor: default;
            }
            .hwgila-dialog-backdrop {
                position: fixed;
                inset: 0;
                z-index: 99998;
                background: rgba(0, 0, 0, 0.35);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .hwgila-dialog {
                width: min(420px, calc(100vw - 30px));
                background: #fff;
                border: 2px solid #336699;
                border-radius: 5px;
                box-shadow: 0 5px 18px rgba(0, 0, 0, 0.35);
                padding: 12px;
                color: #222;
                font: 12px/1.35 Tahoma, Arial, sans-serif;
            }
            .hwgila-dialog-heading {
                font-size: 15px;
                font-weight: bold;
                padding-bottom: 6px;
                margin-bottom: 6px;
                border-bottom: 1px solid #99b9d8;
            }
            .hwgila-dialog-recipient {
                margin-bottom: 10px;
                color: #555;
            }
            .hwgila-dialog-form {
                display: grid;
                gap: 9px;
            }
            .hwgila-dialog-form label {
                display: grid;
                grid-template-columns: 70px 1fr;
                align-items: center;
                gap: 8px;
                font-weight: bold;
            }
            .hwgila-dialog-form input {
                width: 100%;
                box-sizing: border-box;
                padding: 5px 7px;
                border: 1px solid #aaa;
                border-radius: 3px;
                font: inherit;
                transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
            }
            .hwgila-dialog-form select {
                width: 100%;
                box-sizing: border-box;
                padding: 5px 7px;
                border: 1px solid #aaa;
                border-radius: 3px;
                font: inherit;
                background: #fff;
            }
            .hwgila-mining-union-gear {
                margin: 0;
                padding: 7px 9px 9px;
                border: 1px solid #bbb;
                border-radius: 3px;
            }
            .hwgila-mining-union-gear legend {
                padding: 0 5px;
                font-weight: bold;
            }
            .hwgila-mining-union-item {
                display: flex !important;
                grid-template-columns: none !important;
                align-items: center !important;
                gap: 7px !important;
                margin: 3px 0;
                font-weight: normal !important;
            }
            .hwgila-mining-union-item input {
                width: auto !important;
            }
            .hwgila-dialog-form select:hover,
            .hwgila-dialog-form select:focus-visible,
            .hwgila-dialog-form input:hover,
            .hwgila-dialog-form input:focus-visible {
                border-color: #336699;
                box-shadow: 0 0 0 2px rgba(51, 102, 153, 0.22);
                outline: none;
            }
            .hwgila-milestone-correction {
                margin: -5px 0 0 78px;
                color: #777;
                font-size: 11px;
                font-style: italic;
            }
            .hwgila-milestone-validation {
                margin: 0 0 0 78px;
                font-size: 11px;
                line-height: 1.45;
            }
            .hwgila-milestone-validation.is-checking {
                color: #777;
                font-style: italic;
            }
            .hwgila-milestone-validation-line.is-verified {
                color: #3f6f3f;
            }
            .hwgila-milestone-validation-line.is-failed {
                color: #9a2222;
                font-weight: bold;
            }
            .hwgila-milestone-validation-line.is-unknown {
                color: #777;
                font-style: italic;
            }
            .hwgila-drink-tank-warning {
                margin: -2px 0 0 78px;
                font-size: 11px;
            }
            .hwgila-mining-union-dialog {
                width: min(470px, calc(100vw - 30px));
            }
            .hwgila-mining-union-validation {
                margin: 0 0 0 78px;
                font-size: 11px;
                line-height: 1.45;
            }
            .hwgila-dialog-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                box-shadow: none;
                filter: none;
            }
            .hwgila-dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 12px;
            }
            .hwgila-dialog-actions-split {
                justify-content: space-between;
                align-items: center;
            }
            .hwgila-dialog-actions-left,
            .hwgila-dialog-actions-right {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .hwgila-dialog-button {
                padding: 5px 11px;
                border-radius: 3px;
                cursor: pointer;
                font: bold 11px Tahoma, Arial, sans-serif;
                transition: border-color 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
            }
            .hwgila-dialog-button:hover,
            .hwgila-dialog-button:focus-visible {
                border-color: #336699;
                box-shadow: 0 0 0 2px rgba(51, 102, 153, 0.22);
                outline: none;
                filter: brightness(0.98);
            }
            .hwgila-dialog-cancel {
                border: 1px solid #aaa;
                background: #eee;
                color: #333;
            }
            .hwgila-dialog-save {
                border: 1px solid #6699cc;
                background: #e6f3ff;
                color: #234;
            }
            .hwgila-dialog-complete {
                border: 1px solid #8db98d;
                background: #e6ffe6;
                color: #234;
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // Gang Loans
    // ---------------------------------------------------------------------

    function initLoansArea() {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea) return;

        if (action === 'loan_add') {
            handleLoanConfirmation(contentArea);
            return;
        }

        if (action === 'loan_del') {
            // Native HoboWars clears the loan. We do not need to know which
            // one here; the next outstanding-loans table reconciliation does.
            return;
        }

        if (action !== 'loans') return;

        const nativeLoans = parseOutstandingLoans(contentArea);
        reconcileRegistry(nativeLoans);
        bindNativeLoanSubmitCapture();
        injectLoansStyles();
        renderLoansPanel(contentArea, nativeLoans);
    }

    function bindNativeLoanSubmitCapture() {
        const form = document.querySelector('form[action*="do=loan_add"]');
        if (!form || form.dataset.hwgilaBound === '1') return;
        form.dataset.hwgilaBound = '1';

        form.addEventListener('submit', () => {
            const loaded = readSessionJson(SESSION_LOADED_KEY);
            if (!loaded) return;

            const hoboId = document.getElementById('hobo')?.value.trim() || '';
            const amount = normalizeAmount(document.getElementById('addAmt')?.value || '');
            const memo = (document.querySelector('input[name="l_memo"]')?.value || '').trim().substring(0, 60);
            const bankField = document.getElementById('banks');
            const bankId = bankField?.value || '';
            const bankLabel = getSelectedVaultName(bankField);

            if (!hoboId || hoboId !== String(loaded.hoboId)) {
                sessionStorage.removeItem(SESSION_LOADED_KEY);
                return;
            }

            sessionStorage.setItem(SESSION_SUBMISSION_KEY, JSON.stringify({
                threadTitle: loaded.threadTitle,
                entryKey: loaded.entryKey,
                hoboId,
                recipient: loaded.recipient,
                amount,
                memo,
                bankId,
                bankLabel
            }));
        });
    }

    function handleLoanConfirmation(contentArea) {
        if (!contentArea.textContent.includes('You have successfully completed the transfer')) return;

        const submission = readSessionJson(SESSION_SUBMISSION_KEY);
        sessionStorage.removeItem(SESSION_SUBMISSION_KEY);
        sessionStorage.removeItem(SESSION_LOADED_KEY);
        if (!submission) return;

        const data = loadData();
        const thread = data.threads?.[submission.threadTitle];
        const recipient = thread?.recipients?.[submission.entryKey || submission.hoboId];
        if (!recipient) return;

        recipient.recipient = submission.recipient || recipient.recipient;
        recipient.status = 'loan-created';
        recipient.nativeLoanId = null;
        recipient.amount = submission.amount;
        recipient.memo = submission.memo;
        recipient.vault = submission.bankLabel || thread.payout?.bankLabel || '';
        recipient.pendingBind = {
            confirmedAt: getHoboServerPseudoTimestamp(),
            amount: submission.amount,
            memo: submission.memo
        };

        saveData(data);
    }

    function parseOutstandingLoans(contentArea) {
        const loans = [];
        const tables = Array.from(contentArea.querySelectorAll('table'));

        const loanTable = tables.find(table => {
            const firstRow = table.rows?.[0];
            if (!firstRow) return false;
            const text = firstRow.textContent.replace(/\s+/g, ' ').trim();
            return text.includes('Member') && text.includes('Date') && text.includes('Amount') && text.includes('Memo');
        });

        if (!loanTable) return loans;

        const rows = Array.from(loanTable.rows);
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const playerLink = row.querySelector('a[href*="cmd=player"][href*="ID="]');
            if (!playerLink) continue;

            const idMatch = playerLink.href.match(/[?&]ID=(\d+)/i);
            if (!idMatch) continue;

            const memoRow = rows[i + 1];
            const memoCell = memoRow?.querySelector('td[id^="td_"]') || null;
            const toggle = row.querySelector('a.toggle[data-target*="td#td_"]');

            let nativeLoanId = '';
            if (memoCell) {
                nativeLoanId = memoCell.id.replace(/^td_/, '');
            } else if (toggle) {
                nativeLoanId = (toggle.dataset.target || '').match(/td#td_(\d+)/)?.[1] || '';
            }
            if (!nativeLoanId) continue;

            const cells = row.cells;
            if (!cells || cells.length < 3) continue;

            const nameNode = playerLink.querySelector('.player-name') || playerLink;
            const recipient = nameNode.textContent.trim();
            const dateText = cells[1].textContent.trim();
            const amountText = cells[2].textContent.trim();
            const memo = memoCell ? memoCell.textContent.trim() : '';

            loans.push({
                nativeLoanId,
                hoboId: idMatch[1],
                recipient,
                dateText,
                createdAt: parseNativeLoanPseudoTimestamp(dateText),
                amount: normalizeAmount(amountText),
                memo,
                row
            });

            if (memoCell) i++;
        }

        return loans;
    }

    function reconcileRegistry(nativeLoans) {
        const data = loadData();
        let changed = false;
        const loansById = new Map(nativeLoans.map(loan => [String(loan.nativeLoanId), loan]));

        Object.values(data.threads).forEach(thread => {
            Object.entries(thread.recipients || {}).forEach(([entryKey, recipient]) => {
                const hoboId = String(recipient.hoboId || (/^\d+$/.test(entryKey) ? entryKey : ''));
                if (!hoboId || recipient.status !== 'loan-created') return;

                if (recipient.nativeLoanId) {
                    if (!loansById.has(String(recipient.nativeLoanId))) {
                        recipient.status = 'completed';
                        if (!Number.isFinite(Number(recipient.completedAt))) {
                            recipient.completedAt = Date.now();
                        }
                        changed = true;
                    }
                    return;
                }

                const pending = recipient.pendingBind;
                if (!pending || pending.confirmedAt === null || pending.confirmedAt === undefined) return;

                const candidates = nativeLoans.filter(loan => {
                    if (loan.hoboId !== String(hoboId)) return false;
                    if (Number(loan.amount) !== Number(pending.amount)) return false;
                    if (loan.memo !== pending.memo) return false;
                    if (loan.createdAt === null) return false;
                    return Math.abs(loan.createdAt - pending.confirmedAt) <= AUTO_BIND_WINDOW_MS;
                });

                if (candidates.length !== 1) return;

                const match = candidates[0];
                recipient.nativeLoanId = match.nativeLoanId;
                recipient.recipient = match.recipient || recipient.recipient;
                recipient.amount = match.amount;
                recipient.memo = match.memo;
                delete recipient.pendingBind;
                changed = true;
            });
        });

        if (changed) saveData(data);
    }

    function renderLoansPanel(contentArea, nativeLoans) {
        const old = document.getElementById('hwgila-panel');
        if (old) old.remove();

        const data = loadData();
        const titles = Object.keys(data.threads);

        const panel = document.createElement('div');
        panel.id = 'hwgila-panel';

        const heading = document.createElement('div');
        heading.className = 'hwgila-heading';
        heading.textContent = 'Gang Incentives and Loans Aid';
        panel.appendChild(heading);

        if (!titles.length) {
            const empty = document.createElement('div');
            empty.className = 'hwgila-empty';
            empty.textContent = '- -';
            panel.appendChild(empty);
        } else {
            titles.forEach(title => {
                panel.appendChild(renderThreadLoanBlock(title, data.threads[title], nativeLoans));
            });
        }

        contentArea.insertBefore(panel, contentArea.firstChild);
    }

    function renderThreadLoanBlock(title, thread, nativeLoans) {
        const block = document.createElement('div');
        block.className = 'hwgila-thread-block';

        const titleRow = document.createElement('div');
        titleRow.className = 'hwgila-title-row';

        const titleText = document.createElement('strong');
        titleText.textContent = title;
        titleRow.appendChild(titleText);

        const titleActions = document.createElement('div');
        titleActions.className = 'hwgila-title-actions';

        const exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.className = 'hwgila-small';
        exportButton.textContent = 'Copy +';
        exportButton.addEventListener('click', async () => {
            const currentData = loadData();
            const currentThread = currentData.threads?.[title];
            if (!currentThread) return;

            const text = buildThreadClipboardExport(title, currentThread);
            if (!text) {
                alert('GILA found no payout recipients to export for this thread.');
                return;
            }

            const copied = await copyTextToClipboard(text);
            if (!copied) {
                alert('GILA could not copy the export to the clipboard.');
                return;
            }

            const old = exportButton.textContent;
            exportButton.textContent = 'Copied ✓';
            setTimeout(() => { exportButton.textContent = old; }, 1200);
        });
        titleActions.appendChild(exportButton);

        if (isMilestoneIncentivesThread(title)) {
            const summaryButton = document.createElement('button');
            summaryButton.type = 'button';
            summaryButton.className = 'hwgila-small';
            summaryButton.textContent = 'Copy Summary';
            summaryButton.addEventListener('click', async () => {
                const currentData = loadData();
                const currentThread = currentData.threads?.[title];
                if (!currentThread) return;

                const text = buildMilestoneSummaryExport(currentThread);
                if (!text) {
                    alert('GILA found no milestone recipients to export for this thread.');
                    return;
                }

                const copied = await copyTextToClipboard(text);
                if (!copied) {
                    alert('GILA could not copy the milestone summary to the clipboard.');
                    return;
                }

                const old = summaryButton.textContent;
                summaryButton.textContent = 'Copied ✓';
                setTimeout(() => { summaryButton.textContent = old; }, 1200);
            });
            titleActions.appendChild(summaryButton);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'hwgila-small hwgila-danger';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
            if (!confirm(`Remove saved payouts for "${title}"?`)) return;
            const data = loadData();
            delete data.threads[title];
            saveData(data);
            renderLoansPanel(document.querySelector('.content-area'), parseOutstandingLoans(document.querySelector('.content-area')));
        });
        titleActions.appendChild(remove);
        titleRow.appendChild(titleActions);
        block.appendChild(titleRow);

        const settings = document.createElement('div');
        settings.className = 'hwgila-settings';

        const bankLabel = document.createElement('label');
        bankLabel.className = 'hwgila-setting-bank';
        bankLabel.textContent = 'Gang Vault ';
        const bankSelect = cloneBankSelect(thread.payout.bankId);
        bankLabel.appendChild(bankSelect);
        settings.appendChild(bankLabel);

        const amountLabel = document.createElement('label');
        amountLabel.className = 'hwgila-setting-amount';
        amountLabel.textContent = 'Amount ';
        const amountInput = document.createElement('input');
        amountInput.type = 'text';
        amountInput.value = thread.payout.amount || '';
        amountInput.placeholder = '$1,500,000';
        amountInput.className = 'hwgila-amount';
        wireCurrencyInput(amountInput);
        amountLabel.appendChild(amountInput);
        settings.appendChild(amountLabel);

        const memoLabel = document.createElement('label');
        memoLabel.className = 'hwgila-setting-memo';
        memoLabel.textContent = 'Memo ';
        const memoInput = document.createElement('input');
        memoInput.type = 'text';
        memoInput.maxLength = 60;
        memoInput.value = thread.payout.memo ?? title;
        memoInput.className = 'hwgila-memo';
        memoLabel.appendChild(memoInput);
        settings.appendChild(memoLabel);

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'hwgila-small hwgila-setting-save';
        save.textContent = 'Save';
        save.addEventListener('click', () => {
            const data = loadData();
            const current = data.threads[title];
            if (!current) return;

            current.payout.bankId = bankSelect.value;
            current.payout.bankLabel = getSelectedVaultName(bankSelect);
            current.payout.amount = amountInput.value.replace(/[^0-9]/g, '');
            current.payout.memo = memoInput.value.trim().substring(0, 60);
            saveData(data);

            const old = save.textContent;
            save.textContent = 'Saved';
            setTimeout(() => { save.textContent = old; }, 1200);
        });
        settings.appendChild(save);

        const totalBox = document.createElement('div');
        totalBox.className = 'hwgila-setting-total';
        totalBox.style.textAlign= 'center';
        const totalLabel = document.createElement('strong');
        totalLabel.textContent = 'Total:';
        const totalValue = document.createElement('span');
        totalValue.className = 'hwgila-total-value';
        totalBox.append(totalLabel, totalValue);
        settings.appendChild(totalBox);

        const refreshDisplayedTotal = () => {
            totalValue.textContent = formatCurrency(
                calculateWorkflowTotal(thread, amountInput.value)
            );
        };
        refreshDisplayedTotal();
        amountInput.addEventListener('input', refreshDisplayedTotal);

        block.appendChild(settings);

        const table = document.createElement('table');
        table.className = 'hwgila-recipient-table';
        table.innerHTML = '<thead><tr><th>Recipient</th><th>Status</th><th>Action</th></tr></thead>';
        const tbody = document.createElement('tbody');

        const recipients = Object.entries(thread.recipients || {})
            .map(([entryKey, recipient], index) => ({ entryKey, recipient, index }))
            .sort((a, b) => {
                const aCompleted = a.recipient?.status === 'completed';
                const bCompleted = b.recipient?.status === 'completed';

                // Active workflow rows always stay above completed history.
                if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

                // Preserve discovery/insertion order for active rows.
                if (!aCompleted) return a.index - b.index;

                // Completed rows are chronological: oldest completion first.
                // Legacy completed rows that predate completedAt are treated as
                // older than timestamped completions, without inventing a time.
                const aTime = Number(a.recipient?.completedAt);
                const bTime = Number(b.recipient?.completedAt);
                const aHasTime = Number.isFinite(aTime);
                const bHasTime = Number.isFinite(bTime);
                if (aHasTime && bHasTime && aTime !== bTime) return aTime - bTime;
                if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
                return a.index - b.index;
            });

        recipients.forEach(({ entryKey, recipient }) => {
            const hoboId = String(recipient.hoboId || (/^\d+$/.test(entryKey) ? entryKey : ''));
            if (!hoboId) return;
            tbody.appendChild(renderRecipientRow(title, thread, entryKey, hoboId, recipient, nativeLoans));
        });

        table.appendChild(tbody);
        block.appendChild(table);

        // The tbody owns its own vertical viewport. Let the current row mix
        // determine the height after layout so completed history collapses
        // progressively while active work remains fully visible.
        requestAnimationFrame(() => configureRecipientTableBody(table, tbody));
        return block;
    }

    function renderRecipientRow(threadTitle, thread, entryKey, hoboId, recipient, nativeLoans) {
        const tr = document.createElement('tr');
        tr.className = recipient.status === 'completed'
            ? 'hwgila-recipient-row is-completed'
            : 'hwgila-recipient-row is-incomplete';

        const nameTd = document.createElement('td');
        const link = document.createElement('a');
        link.href = buildGameUrl({ cmd: 'player', ID: hoboId });
        link.textContent = recipient.recipient || `#${hoboId}`;
        nameTd.appendChild(link);
        tr.appendChild(nameTd);

        const statusTd = document.createElement('td');
        statusTd.textContent = statusLabel(recipient);
        tr.appendChild(statusTd);

        const actionTd = document.createElement('td');

        if (recipient.status === 'pending') {
            const loadBtn = makeButton('Load Loan', () => {
                loadRecipientIntoNativeForm(threadTitle, thread, entryKey, hoboId, recipient);
            });
            actionTd.appendChild(loadBtn);

            const markBtn = makeButton('Mark Created', () => {
                updateRecipient(threadTitle, entryKey, rec => {
                    rec.status = 'loan-created';
                    rec.nativeLoanId = null;
                    rec.amount = null;
                    rec.memo = null;
                    delete rec.completedAt;
                    delete rec.pendingBind;
                });
                refreshLoansPagePanel(nativeLoans);
            }, 'hwgila-secondary');
            actionTd.appendChild(markBtn);
        } else if (recipient.status === 'loan-created') {
            if (!recipient.nativeLoanId) {
                const associateBtn = makeButton('Link Existing', () => {
                    if (associateBtn.dataset.associationActive === '1') {
                        clearAssociationCandidates();
                        resetAssociationToggleButtons();
                        return;
                    }

                    const shown = showAssociationCandidates(
                        threadTitle,
                        entryKey,
                        hoboId,
                        recipient,
                        nativeLoans
                    );

                    if (shown > 0) {
                        resetAssociationToggleButtons();
                        associateBtn.dataset.associationActive = '1';
                        associateBtn.textContent = 'Cancel';
                    }
                });
                associateBtn.classList.add('hwgila-associate-toggle');
                actionTd.appendChild(associateBtn);
            }

            const resetBtn = makeButton('Reset', () => {
                updateRecipient(threadTitle, entryKey, rec => {
                    rec.status = 'pending';
                    rec.nativeLoanId = null;
                    rec.amount = null;
                    rec.memo = null;
                    delete rec.completedAt;
                    delete rec.pendingBind;
                });
                refreshLoansPagePanel(nativeLoans);
            }, 'hwgila-secondary');
            actionTd.appendChild(resetBtn);
        } else if (recipient.status === 'completed') {
            // Completed loans are terminal in the normal workflow. Do not expose
            // a convenient per-recipient reset that could accidentally reopen
            // an already reconciled payout.
        }

        tr.appendChild(actionTd);
        return tr;
    }

    function configureRecipientTableBody(table, tbody) {
        const rows = Array.from(tbody.querySelectorAll(':scope > tr.hwgila-recipient-row'));

        if (!rows.length) {
            tbody.style.minHeight = '0px';
            tbody.style.maxHeight = '0px';
            tbody.style.overflowY = 'hidden';
            return;
        }

        const rowHeights = rows.map(row => row.getBoundingClientRect().height || row.offsetHeight || 0);
        const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);
        const minimumRowCount = Math.min(rows.length, 3);
        const minimumHeight = rowHeights.slice(0, minimumRowCount).reduce((sum, height) => sum + height, 0);

        const incompleteRows = rows.filter(row => row.classList.contains('is-incomplete'));
        const completedRows = rows.filter(row => row.classList.contains('is-completed'));

        let desiredMaxHeight = totalHeight;
        if (completedRows.length > 0) {
            const incompleteHeight = incompleteRows.reduce((sum, row) => {
                const index = rows.indexOf(row);
                return sum + (rowHeights[index] || 0);
            }, 0);
            const firstCompletedHeight = completedRows[0].getBoundingClientRect().height || completedRows[0].offsetHeight || 0;
            const completedGlimpse = Math.max(6, Math.round(firstCompletedHeight * 0.35));
            desiredMaxHeight = incompleteHeight + completedGlimpse;
        }

        const viewportHeight = Math.max(minimumHeight, desiredMaxHeight);
        tbody.style.minHeight = `${Math.ceil(minimumHeight)}px`;
        tbody.style.maxHeight = `${Math.ceil(viewportHeight)}px`;
        tbody.style.overflowY = totalHeight > viewportHeight + 1 ? 'auto' : 'hidden';
    }

    function loadRecipientIntoNativeForm(threadTitle, thread, entryKey, hoboId, recipient) {
        const hoboField = document.getElementById('hobo');
        const amountField = document.getElementById('addAmt');
        const memoField = document.querySelector('input[name="l_memo"]');
        const bankField = document.getElementById('banks');
        const membersField = document.getElementById('money-mems');

        if (!hoboField || !amountField || !memoField || !bankField) {
            alert('Could not find Give a Loan fields.');
            return;
        }

        hoboField.value = hoboId;
        const effectiveAmount = recipient.amount !== null && recipient.amount !== undefined
            ? recipient.amount
            : thread.payout.amount;
        const effectiveMemo = recipient.memo !== null && recipient.memo !== undefined
            ? recipient.memo
            : (thread.payout.memo ?? threadTitle);

        amountField.value = String(effectiveAmount || '').replace(/[^0-9]/g, '');
        memoField.value = String(effectiveMemo ?? '').substring(0, 60);
        if (thread.payout.bankId !== '') bankField.value = thread.payout.bankId;
        if (membersField && Array.from(membersField.options).some(opt => opt.value === hoboId)) {
            membersField.value = hoboId;
        }

        hoboField.dispatchEvent(new Event('input', { bubbles: true }));
        amountField.dispatchEvent(new Event('input', { bubbles: true }));
        memoField.dispatchEvent(new Event('input', { bubbles: true }));
        bankField.dispatchEvent(new Event('change', { bubbles: true }));

        sessionStorage.setItem(SESSION_LOADED_KEY, JSON.stringify({
            threadTitle,
            entryKey,
            hoboId,
            recipient: recipient.recipient
        }));

        document.querySelector('form[action*="do=loan_add"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function showAssociationCandidates(threadTitle, entryKey, hoboId, recipient, nativeLoans) {
        clearAssociationCandidates();

        const candidates = nativeLoans.filter(loan =>
            loan.hoboId === String(hoboId) && loan.row?.isConnected
        );

        if (!candidates.length) {
            alert('No outstanding loans were found for this hobo.');
            return 0;
        }

        candidates.forEach(loan => {
            const row = loan.row;
            const hostCell = row.cells?.[row.cells.length - 1];
            if (!hostCell) return;

            hostCell.classList.add('hwgila-association-host');
            row.classList.add('hwgila-association-candidate');

            const anchor = document.createElement('button');
            anchor.type = 'button';
            anchor.className = 'hwgila-native-associate-anchor';
            anchor.textContent = 'Link Loan';
            anchor.dataset.loanId = loan.nativeLoanId;

            anchor.addEventListener('click', () => {
                associateNativeLoan(threadTitle, entryKey, hoboId, loan);
                clearAssociationCandidates();
                resetAssociationToggleButtons();
                refreshLoansPagePanel(nativeLoans);
            });

            hostCell.appendChild(anchor);
        });

        candidates[0].row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return candidates.length;
    }

    function associateNativeLoan(threadTitle, entryKey, hoboId, loan) {
        updateRecipient(threadTitle, entryKey, rec => {
            rec.status = 'loan-created';
            rec.nativeLoanId = loan.nativeLoanId;
            rec.recipient = loan.recipient || rec.recipient;
            rec.amount = loan.amount;
            rec.memo = loan.memo;
            delete rec.pendingBind;
        });
    }

    function clearAssociationCandidates() {
        document.querySelectorAll('.hwgila-native-associate-anchor').forEach(el => el.remove());
        document.querySelectorAll('.hwgila-association-host').forEach(el => {
            el.classList.remove('hwgila-association-host');
        });
        document.querySelectorAll('.hwgila-association-candidate').forEach(el => {
            el.classList.remove('hwgila-association-candidate');
        });
    }

    function resetAssociationToggleButtons() {
        document.querySelectorAll('.hwgila-associate-toggle').forEach(button => {
            delete button.dataset.associationActive;
            button.textContent = 'Link Existing';
        });
    }

    function updateRecipient(threadTitle, entryKey, updater) {
        const data = loadData();
        const recipient = data.threads?.[threadTitle]?.recipients?.[entryKey];
        if (!recipient) return;
        updater(recipient);
        saveData(data);
    }

    function refreshLoansPagePanel(nativeLoans) {
        const contentArea = document.querySelector('.content-area');
        if (!contentArea) return;
        renderLoansPanel(contentArea, nativeLoans);
    }

    function statusLabel(recipient) {
        if (recipient.status === 'completed') return 'Completed';
        if (recipient.status === 'loan-created' && recipient.nativeLoanId) {
            return `Loan Created (#${recipient.nativeLoanId})`;
        }
        if (recipient.status === 'loan-created') return 'Loan Created — Unassociated';
        return 'Pending';
    }

    function calculateWorkflowTotal(thread, fallbackAmount = null) {
        const threadAmount = fallbackAmount !== null
            ? normalizeAmount(fallbackAmount)
            : normalizeAmount(thread.payout?.amount);

        return Object.values(thread.recipients || {}).reduce((sum, recipient) => {
            const amount = recipient.amount !== null && recipient.amount !== undefined
                ? normalizeAmount(recipient.amount)
                : threadAmount;
            return sum + amount;
        }, 0);
    }

    function buildMilestoneSummaryExport(thread) {
        const recipients = Object.values(thread?.recipients || {})
            .filter(recipient => recipient && recipient.hoboId);

        if (!recipients.length) return '';

        const lines = [`[b]${getCurrentHoboMonthYear()}[/b]`];

        recipients.forEach(recipient => {
            const hoboId = String(recipient.hoboId || '').trim();
            if (!hoboId) return;

            const amount = recipient.amount !== null && recipient.amount !== undefined
                ? normalizeAmount(recipient.amount)
                : normalizeAmount(thread.payout?.amount);

            const memo = recipient.memo !== null && recipient.memo !== undefined
                ? String(recipient.memo).trim()
                : String(thread.payout?.memo || '').trim();

            if (!memo) return;

            lines.push(
                `[hoboname=${hoboId}] - ${memo} = ${formatCurrency(amount)}`
            );
        });

        return lines.length > 1 ? lines.join('\n') : '';
    }

    function getCurrentHoboMonthYear() {
        const clock = document.getElementById('clock');
        const parentText = clock?.parentElement?.textContent || '';

        const match = parentText.match(
            /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i
        );

        if (match) {
            const month = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
            const year = match[2] || String(new Date().getFullYear());
            return `${month} ${year}`;
        }

        const now = new Date();
        return now.toLocaleString('en-US', {
            month: 'long',
            year: 'numeric'
        });
    }

    function buildThreadClipboardExport(threadTitle, thread) {
        const NAME_WIDTH = 25;
        const lines = ['[pre]'];
        const recipients = Object.values(thread.recipients || {});
        const totalAmount = calculateWorkflowTotal(thread);

        recipients.forEach(recipient => {
            const hoboId = String(recipient.hoboId || '').trim();
            const name = String(recipient.recipient || `#${hoboId}`).trim();
            if (!hoboId || !name) return;

            // Pad the visible hobo name to HoboWars' 25-character name width
            // first, then replace the name itself with the compact HBTML tag.
            const paddedName = name.padEnd(NAME_WIDTH, ' ');
            const padding = paddedName.slice(name.length);

            const amount = recipient.amount !== null && recipient.amount !== undefined
                ? recipient.amount
                : thread.payout?.amount;
            const memo = recipient.memo !== null && recipient.memo !== undefined
                ? String(recipient.memo)
                : String(thread.payout?.memo ?? threadTitle);
            const vault = String(
                recipient.vault
                || thread.payout?.bankLabel
                || getVaultNameById(thread.payout?.bankId)
                || ''
            );

            lines.push(
                `[hoboname=${hoboId}]${padding} - ${formatCurrency(amount)} - ${vault || 'Unknown Vault'} - ${memo}`
            );
        });

        if (lines.length === 1) return '';
        lines.push(`${'TOTAL'.padEnd(NAME_WIDTH, ' ')} - ${formatCurrency(totalAmount)}`);
        lines.push('[/pre]');
        return lines.join('\n');
    }

    function getSelectedVaultName(select) {
        if (!select) return '';
        const option = select.options?.[select.selectedIndex];
        return cleanVaultLabel(option?.textContent || '');
    }

    function getVaultNameById(bankId) {
        const native = document.getElementById('banks');
        if (!native) return '';
        const option = Array.from(native.options).find(opt => String(opt.value) === String(bankId ?? ''));
        return cleanVaultLabel(option?.textContent || '');
    }

    function cleanVaultLabel(label) {
        return String(label)
            .trim()
            .replace(/\s+\([^)]*\)\s*$/, '')
            .trim();
    }

    async function copyTextToClipboard(text) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) {
            // Fall through to the legacy copy path.
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.select();

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (_) {
            copied = false;
        }
        textarea.remove();
        return copied;
    }

    function makeButton(text, handler, extraClass = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `hwgila-small ${extraClass}`.trim();
        button.textContent = text;
        button.addEventListener('click', handler);
        return button;
    }

    function cloneBankSelect(selectedValue) {
        const native = document.getElementById('banks');
        const select = document.createElement('select');
        select.className = 'hwgila-bank';

        if (native) {
            Array.from(native.options).forEach(option => select.appendChild(option.cloneNode(true)));
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Native bank list unavailable';
            select.appendChild(option);
        }

        select.value = selectedValue || '';
        return select;
    }

    function injectLoansStyles() {
        if (document.getElementById('hwgila-loan-styles')) return;
        const style = document.createElement('style');
        style.id = 'hwgila-loan-styles';
        style.textContent = `
            #hwgila-panel {
                border: 2px solid #336699;
                background: #eef5ff;
                padding: 12px;
                margin-bottom: 18px;
                border-radius: 4px;
                color: #222;
                font: 12px/1.35 Tahoma, Arial, sans-serif;
            }
            .hwgila-heading {
                font-size: 15px;
                font-weight: bold;
                padding-bottom: 6px;
                margin-bottom: 8px;
                border-bottom: 1px solid #99b9d8;
            }
            .hwgila-thread-block {
                background: #fff;
                border: 1px solid #b3d4fc;
                border-radius: 3px;
                padding: 8px;
                margin-top: 8px;
            }
            .hwgila-title-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .hwgila-title-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                margin-bottom: 7px;
            }
            .hwgila-settings {
                display: grid;
                grid-template-columns: max-content minmax(0, 1fr) max-content;
                grid-template-areas:
                    "bank amount total"
                    "memo save total";
                gap: 8px 12px;
                align-items: center;
                padding: 6px;
                margin-bottom: 8px;
                background: #f5f9ff;
                border: 1px solid #d8e8fa;
            }
            .hwgila-settings label {
                font-weight: bold;
            }
            .hwgila-setting-bank { grid-area: bank; white-space: nowrap; }
            .hwgila-setting-amount { grid-area: amount; white-space: nowrap; }
            .hwgila-setting-memo { grid-area: memo; white-space: nowrap; }
            .hwgila-setting-save { grid-area: save; justify-self: start; }
            .hwgila-setting-total {
                grid-area: total;
                align-self: stretch;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                min-width: 120px;
                padding: 1px 4px;
                white-space: nowrap;
            }
            .hwgila-total-value {
                font-size: 14px;
                font-weight: bold;
                color: #234f8a;
            }
            .hwgila-bank { max-width: 230px; }
            .hwgila-amount { width: 120px; }
            .hwgila-memo { width: min(310px, 36vw); }
            .hwgila-recipient-table {
                width: 100%;
                border-collapse: collapse;
                table-layout: fixed;
            }
            .hwgila-recipient-table thead,
            .hwgila-recipient-table tbody tr {
                display: table;
                width: 100%;
                table-layout: fixed;
            }
            .hwgila-recipient-table tbody {
                display: block;
                width: 100%;
                overflow-x: hidden;
                scrollbar-gutter: stable;
            }
            .hwgila-recipient-table th,
            .hwgila-recipient-table td {
                padding: 4px 5px;
                border-bottom: 1px solid #eee;
                text-align: left;
                vertical-align: middle;
            }
            .hwgila-recipient-table th:nth-child(2),
            .hwgila-recipient-table td:nth-child(2) {
                width: 190px;
            }
            .hwgila-recipient-table th:last-child,
            .hwgila-recipient-table td:last-child {
                text-align: right;
                white-space: nowrap;
            }
            .hwgila-small {
                padding: 3px 7px;
                margin-left: 5px;
                border: 1px solid #99b9d8;
                border-radius: 3px;
                background: #e6f3ff;
                color: #234;
                cursor: pointer;
                font-size: 11px;
            }
            .hwgila-secondary {
                background: #f3f3f3;
                border-color: #bbb;
            }
            .hwgila-danger {
                background: #ffe6e6;
                border-color: #dd9999;
                color: #900;
            }
            .hwgila-association-host {
                position: relative;
                overflow: visible;
            }
            .hwgila-native-associate-anchor {
                position: absolute;
                left: calc(100% + 8px);
                top: 50%;
                transform: translateY(-50%);
                z-index: 20;
                padding: 3px 8px;
                border: 1px solid #99b9d8;
                border-radius: 3px;
                background: #e6f3ff;
                color: #234;
                cursor: pointer;
                font-size: 11px;
                white-space: nowrap;
            }
            .hwgila-empty {
                color: #666;
                font-style: italic;
                padding: 5px;
            }
        `;
        document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // Timestamp + parsing helpers
    // ---------------------------------------------------------------------

    function getHoboServerPseudoTimestamp() {
        const clock = document.getElementById('clock');
        if (!clock) return null;

        const time = parseClockTime(clock.textContent.trim());
        if (!time) return null;

        let month = null;
        let day = null;
        let year = new Date().getFullYear();

        const parentText = clock.parentElement?.textContent || '';
        const dateMatch = parentText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
        if (dateMatch) {
            month = monthIndex(dateMatch[1]);
            day = Number(dateMatch[2]);
            if (dateMatch[3]) year = Number(dateMatch[3]);
        }

        if (month === null || !day) return null;
        return Date.UTC(year, month, day, time.hour, time.minute, time.second);
    }

    function parseNativeLoanPseudoTimestamp(text) {
        const match = String(text).trim().match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\.(\d{2})\s*(AM|PM)$/i
        );
        if (!match) return null;

        let year = Number(match[3]);
        if (year < 100) year += 2000;

        let hour = Number(match[4]);
        const ampm = match[7].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;

        return Date.UTC(
            year,
            Number(match[1]) - 1,
            Number(match[2]),
            hour,
            Number(match[5]),
            Number(match[6])
        );
    }

    function parseClockTime(text) {
        const match = String(text).match(/(\d{1,2}):(\d{2})(?:[:.](\d{2}))?\s*(AM|PM)/i);
        if (!match) return null;

        let hour = Number(match[1]);
        const ampm = match[4].toUpperCase();
        if (ampm === 'PM' && hour !== 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;

        return {
            hour,
            minute: Number(match[2]),
            second: Number(match[3] || 0)
        };
    }

    function monthIndex(mon) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const index = months.indexOf(String(mon).slice(0, 3).toLowerCase());
        return index >= 0 ? index : null;
    }

    function wireCurrencyInput(input) {
        if (!input || input.dataset.hwgilaCurrencyBound === '1') return;
        input.dataset.hwgilaCurrencyBound = '1';

        // Permit only ASCII digits, commas, and Unicode currency symbols.
        // Valid numeric input is given 3-digit comma separation
        // grouping so long strings of zeroes remain human-readable.
        const allowed = /^[0-9,\p{Sc}]*$/u;

        const formatValue = value => {
            const raw = String(value || '');
            if (!allowed.test(raw)) return null;

            const symbols = (raw.match(/\p{Sc}/gu) || []).join('');
            const digits = raw.replace(/[^0-9]/g, '');
            if (!digits) return symbols;

            const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return symbols + grouped;
        };

        let lastValid = formatValue(input.value);
        if (lastValid === null) lastValid = '';
        input.value = lastValid;

        input.addEventListener('input', () => {
            const formatted = formatValue(input.value);
            if (formatted === null) {
                input.value = lastValid;
                input.setSelectionRange(input.value.length, input.value.length);
                return;
            }

            input.value = formatted;
            lastValid = formatted;
            input.setSelectionRange(input.value.length, input.value.length);
        });
    }

    function normalizeAmount(value) {
        const digits = String(value).replace(/[^0-9]/g, '');
        return digits ? Number(digits) : 0;
    }

    function formatCurrency(value) {
        return '$' + Number(value || 0).toLocaleString();
    }

    function readSessionJson(key) {
        try {
            return JSON.parse(sessionStorage.getItem(key) || 'null');
        } catch (_) {
            return null;
        }
    }

    function buildGameUrl(changes) {
        const url = new URL(window.location.href);
        url.search = '';
        const sr = params.get('sr');
        if (sr) url.searchParams.set('sr', sr);
        Object.entries(changes).forEach(([key, value]) => url.searchParams.set(key, value));
        return url.pathname + url.search;
    }
})();

/* ===== Component 2: HoboWars GP Awake Exporter v1.5 ===== */
(() => {
    'use strict';

    if (!HWGT_isModuleEnabled('gp-exporter')) return;

    const params = new URLSearchParams(location.search);

    // Only operate on the gang landing page, including variants such as &w=lastsh.
    if (params.get('cmd') !== 'gang' || params.get('do') !== 'enter') return;

    const NAME_WIDTH = 35;

    function findAwakeTable() {
        return [...document.querySelectorAll('table')].find((table) => {
            const row = table.rows?.[0];
            if (!row || row.cells.length < 2) return false;

            return row.cells[0].textContent.trim() === 'Hobo'
                && row.cells[1].textContent.trim() === 'Awake';
        });
    }

    function extractPlayerId(link) {
        const href = link?.getAttribute('href') || '';
        return href.match(/[?&]ID=(\d+)/i)?.[1] ?? null;
    }

    function buildExport(table) {
        const lines = ['[pre]'];
        let hoboCount = 0;
        let totalAwake = 0;

        for (const row of [...table.rows].slice(1)) {
            if (row.cells.length < 2) continue;

            const link = row.cells[0].querySelector('a[href*="ID="]');
            const username = link?.textContent.trim() || '';
            const playerId = extractPlayerId(link);
            const awakeText = row.cells[1].textContent.trim();
            const awake = Number.parseInt(awakeText.replace(/,/g, ''), 10);

            if (!username || !playerId || !Number.isFinite(awake)) continue;

            const padding = ' '.repeat(Math.max(1, NAME_WIDTH - username.length));

            lines.push(`[hoboname=${playerId}]${padding}${awakeText}`);

            hoboCount += 1;
            totalAwake += awake;
        }

        const footerLabel = `Hobos: ${hoboCount}`.padEnd(NAME_WIDTH - 6, ' ');
        lines.push(`[b]${footerLabel}Awake: ${totalAwake}[/b]`);
        lines.push('[/pre]');

        return lines.join('\n');
    }

    function getGpExportDate() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Australia/Brisbane',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            weekday: 'short'
        }).formatToParts(new Date());

        const values = Object.fromEntries(
            parts.filter((part) => part.type !== 'literal')
                 .map((part) => [part.type, part.value])
        );

        let date = new Date(
            Date.UTC(
                Number(values.year),
                Number(values.month) - 1,
                Number(values.day)
            )
        );

        while (date.getUTCDay() !== 3) {
            date.setUTCDate(date.getUTCDate() - 1);
        }

        return `${date.getUTCDate()}-${date.getUTCMonth() + 1}-${date.getUTCFullYear()}`;
    }

    function downloadExport(text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `${getGpExportDate()} GP Export.txt`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function injectExporter() {
        const table = findAwakeTable();
        if (!table || document.getElementById('gp-awake-export')) return;

        const button = document.createElement('button');
        button.id = 'gp-awake-export';
        button.type = 'button';
        button.textContent = 'Export GP Awake';
        button.style.margin = '0 0 6px 0';
        button.style.padding = '2px 7px';
        button.style.cursor = 'pointer';

        button.addEventListener('click', () => {
            downloadExport(buildExport(table));
        });

        table.parentNode.insertBefore(button, table);
    }

    injectExporter();
})();

/* ===== Component 3: Gang Member Stat Tracker v1.2 ===== */
(function () {
    'use strict';

    if (!HWGT_isModuleEnabled('member-stats')) return;

    const params = new URLSearchParams(location.search);
    if (params.get('cmd') !== 'gang' || params.get('do') !== 'list_mem') return;

    const table = document.getElementById('sortabletable');
    if (!table) return;

    const cleanText = value => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const parseMembers = () => {
        const members = {};
        table.querySelectorAll('tbody tr').forEach(row => {
            const checkbox = row.querySelector('input.checkMe[name="players[]"]');
            const profile = row.querySelector('a[href*="cmd=player"][href*="ID="]');
            const memberId =
                cleanText(checkbox?.value) ||
                String(profile?.href.match(/[?&]ID=(\d+)/i)?.[1] || '');
            if (!memberId) return;

            const member = {
                id: memberId,
                name: cleanText(profile?.textContent) || `#${memberId}`,
                profileUrl: profile?.href || '',
                groups: {},
                rawGroups: {},
                chamberText: ''
            };
            Object.entries(HWGT_MEMBER_GROUPS).forEach(([groupId, definition]) => {
                const values = {};
                const rawValues = {};
                Object.entries(definition.stats).forEach(([statId, [className]]) => {
                    const cell = row.querySelector(`td.${className}`);
                    const text = cleanText(cell?.textContent);
                    const numeric = HWGT_parseTrackedNumber(text);
                    rawValues[statId] = text === '' ? null : text;
                    values[statId] = text === ''
                        ? null
                        : Number.isFinite(numeric)
                            ? numeric
                            : text;
                });
                member.groups[groupId] = values;
                member.rawGroups[groupId] = rawValues;
            });
            const chamberCell = row.querySelector('td.ts_chamber');
            member.chamberText = cleanText([
                chamberCell?.textContent,
                ...Array.from(chamberCell?.querySelectorAll('[title], img[alt]') || [])
                    .map(node => node.getAttribute('title') || node.getAttribute('alt') || '')
            ].join(' '));
            members[memberId] = member;
        });
        return members;
    };

    const now = Date.now();
    const members = parseMembers();
    const memberIds = Object.keys(members);
    if (!memberIds.length) return;

    const data = HWGT_loadMemberTrackerData();
    const previousCatalog = { ...data.catalog.members };
    const hasPriorRoster = Object.keys(previousCatalog).length > 0;
    const currentIdSet = new Set(memberIds);

    Object.entries(data.catalog.members).forEach(([memberId, member]) => {
        if (!currentIdSet.has(memberId) && member.membershipState !== 'former') {
            member.membershipState = 'former';
            member.leftAt = now;
        }
    });

    memberIds.forEach(memberId => {
        const parsed = members[memberId];
        const old = previousCatalog[memberId];
        const arrivalState = !old
            ? hasPriorRoster ? 'joined' : 'current'
            : old.membershipState === 'former'
                ? 'returned'
                : 'current';
        data.catalog.members[memberId] = {
            ...(old || {}),
            name: parsed.name,
            profileUrl: parsed.profileUrl || old?.profileUrl || '',
            membershipState: 'current',
            classifications: {
                ...(old?.classifications || {}),
                warChamber: /(?:^|\b)WC(?:\b|$)|WAR\s+CHAMBER/i.test(parsed.chamberText),
                juniorWarChamber: /(?:^|\b)JWC(?:\b|$)|JUNIOR\s+WAR\s+CHAMBER/i.test(parsed.chamberText),
                active: Number(parsed.groups.main.lastActive) <= 43_200,
                inactive: Number(parsed.groups.main.lastActive) > 43_200
            },
            firstSeenAt: old?.firstSeenAt || now,
            lastSeenAt: now,
            lastArrivalState: arrivalState,
            classificationCapturedAt: {
                ...(old?.classificationCapturedAt || {}),
                membersList: now
            }
        };
        delete data.catalog.members[memberId].leftAt;
    });
    data.sources = { ...(data.sources || {}), membersListCapturedAt: now };

    Object.entries(HWGT_MEMBER_GROUPS).forEach(([groupId]) => {
        const groupSettings = data.settings.groups[groupId];
        const boundaryAt = HWGT_scheduleBoundary(groupSettings.schedule, now);
        const epochId = `${groupId}:${boundaryAt}`;
        let epoch = data.epochs.find(item => item.id === epochId);
        const trackedMembers = Object.fromEntries(
            memberIds
                .filter(memberId => HWGT_effectiveMemberTracking(data.settings, memberId, groupId))
                .map(memberId => [memberId, members[memberId]])
        );
        if (!Object.keys(trackedMembers).length) return;

        if (!epoch) {
            const baseline = {};
            Object.entries(trackedMembers).forEach(([memberId, member]) => {
                baseline[memberId] = {
                    name: member.name,
                    membershipState: data.catalog.members[memberId].lastArrivalState || 'current',
                    capturedAt: now,
                    values: { ...member.groups[groupId] },
                    rawValues: { ...member.rawGroups[groupId] }
                };
            });
            epoch = {
                id: epochId,
                group: groupId,
                boundaryAt,
                firstCapturedAt: now,
                lastCapturedAt: now,
                visitCount: 1,
                baseline,
                latest: JSON.parse(JSON.stringify(baseline))
            };
            data.epochs.push(epoch);
        } else {
            epoch.visitCount = (Number(epoch.visitCount) || 0) + 1;
            epoch.lastCapturedAt = now;
            const latest = epoch.latest || (epoch.latest = {});

            Object.entries(trackedMembers).forEach(([memberId, member]) => {
                const currentValues = member.groups[groupId];
                const currentRawValues = member.rawGroups[groupId];
                const previous = latest[memberId];
                const membershipState = !previous
                    ? data.catalog.members[memberId].lastArrivalState || 'joined'
                    : previous.membershipState === 'left'
                        ? 'returned'
                        : 'current';
                const changes = {};

                if (previous) {
                    Object.entries(currentRawValues).forEach(([statId, currentRaw]) => {
                        const previousRaw = HWGT_snapshotRaw(previous, statId);
                        if (previousRaw === currentRaw) return;
                        const from = previous.values?.[statId] ?? HWGT_parseTrackedNumber(previousRaw);
                        const to = currentValues[statId] ?? HWGT_parseTrackedNumber(currentRaw);
                        const baselineRaw = HWGT_snapshotRaw(epoch.baseline?.[memberId], statId);
                        const baselineValue = HWGT_parseTrackedNumber(baselineRaw);
                        changes[statId] = {
                            from: previousRaw,
                            to: currentRaw,
                            fromRaw: previousRaw,
                            toRaw: currentRaw,
                            fromNumeric: Number.isFinite(from) ? from : null,
                            toNumeric: Number.isFinite(to) ? to : null,
                            delta: Number.isFinite(from) && Number.isFinite(to) ? to - from : null,
                            epochDelta: Number.isFinite(baselineValue) && Number.isFinite(to)
                                ? to - baselineValue
                                : null
                        };
                    });
                } else {
                    Object.entries(currentRawValues).forEach(([statId, currentRaw]) => {
                        const currentNumeric = currentValues[statId];
                        changes[statId] = {
                            from: null,
                            to: currentRaw,
                            fromRaw: null,
                            toRaw: currentRaw,
                            fromNumeric: null,
                            toNumeric: Number.isFinite(currentNumeric) ? currentNumeric : null,
                            delta: null,
                            epochDelta: null
                        };
                    });
                }

                if (Object.keys(changes).length || membershipState !== 'current') {
                    data.events.push({
                        id: `${now}:${groupId}:${memberId}`,
                        at: now,
                        group: groupId,
                        epochId,
                        memberId,
                        name: member.name,
                        membershipState,
                        changes
                    });
                }

                latest[memberId] = {
                    name: member.name,
                    membershipState: 'current',
                    capturedAt: now,
                    values: { ...currentValues },
                    rawValues: { ...currentRawValues }
                };
                if (!epoch.baseline?.[memberId]) {
                    epoch.baseline[memberId] = {
                        name: member.name,
                        membershipState,
                        capturedAt: now,
                        values: { ...currentValues },
                        rawValues: { ...currentRawValues }
                    };
                }
            });

            Object.entries(latest).forEach(([memberId, previous]) => {
                if (currentIdSet.has(memberId) || previous.membershipState === 'left') return;
                data.events.push({
                    id: `${now}:${groupId}:${memberId}:left`,
                    at: now,
                    group: groupId,
                    epochId,
                    memberId,
                    name: previous.name || data.catalog.members[memberId]?.name || `#${memberId}`,
                    membershipState: 'left',
                    changes: {}
                });
                latest[memberId] = { ...previous, membershipState: 'left', capturedAt: now };
            });
        }

        const changedEvents = data.events.filter(event => event.at === now && event.group === groupId);
        data.visits.push({
            id: `${now}:${groupId}`,
            at: now,
            group: groupId,
            epochId,
            memberCount: Object.keys(trackedMembers).length,
            changedMemberCount: changedEvents.length
        });

        const cutoff = now - HWGT_retentionMilliseconds(groupSettings.retention);
        const newestBoundary = Math.max(
            ...data.epochs.filter(item => item.group === groupId).map(item => item.boundaryAt)
        );
        const retainedEpochIds = new Set(
            data.epochs
                .filter(item => item.group !== groupId || item.lastCapturedAt >= cutoff || item.boundaryAt === newestBoundary)
                .map(item => item.id)
        );
        data.epochs = data.epochs.filter(item => retainedEpochIds.has(item.id));
        data.events = data.events.filter(event => event.group !== groupId || (event.at >= cutoff && retainedEpochIds.has(event.epochId)));
        data.visits = data.visits.filter(visit => visit.group !== groupId || (visit.at >= cutoff && retainedEpochIds.has(visit.epochId)));
    });

    // Keep GILA's incentive verifier supplied with the newest relevant values.
    const compatibilityMembers = {};
    Object.entries(members).forEach(([memberId, member]) => {
        compatibilityMembers[memberId] = {
            level: HWGT_parseTrackedNumber(member.groups.main.level),
            begging: HWGT_parseTrackedNumber(member.groups.other.begging),
            intelligence: HWGT_parseTrackedNumber(member.groups.other.intelligence),
            drinking: HWGT_parseTrackedNumber(member.groups.other.drinking),
            mining: HWGT_parseTrackedNumber(member.groups.other.mining)
        };
    });
    localStorage.setItem('hwgt_gila_member_stats_v1', JSON.stringify({
        schema: 1,
        capturedAt: now,
        members: compatibilityMembers
    }));

    HWGT_saveMemberTrackerData(data);

    const groupByNavClass = {
        show1: 'main',
        show2: 'battle',
        show3: 'other',
        show4: 'hall'
    };
    const navItems = Array.from(document.querySelectorAll('a.nav.show1, a.nav.show2, a.nav.show3, a.nav.show4'));
    const activeGroup = () => {
        const active = navItems.find(item =>
            item.style.fontWeight === 'bold' || getComputedStyle(item).fontWeight === '700'
        );
        const navClass = active
            ? Object.keys(groupByNavClass).find(className => active.classList.contains(className))
            : 'show1';
        return groupByNavClass[navClass] || 'main';
    };
    const memberCheckboxes = new Map();
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('.hwgt-member-exception-heading')) {
        const heading = document.createElement('th');
        heading.className = 'hwgt-member-exception-heading';
        heading.textContent = '[ \u0394 ]';
        heading.title = 'Check a box to denote that member as an exception for tracker handling.';
        headerRow.appendChild(heading);
    }

    table.querySelectorAll('tbody tr').forEach(row => {
        const nativeCheckbox = row.querySelector('input.checkMe[name="players[]"]');
        const profile = row.querySelector('a[href*="cmd=player"][href*="ID="]');
        const memberId = cleanText(nativeCheckbox?.value) ||
            String(profile?.href.match(/[?&]ID=(\d+)/i)?.[1] || '');
        if (!memberId || row.querySelector('.hwgt-member-exception-cell')) return;
        const cell = document.createElement('td');
        cell.className = 'hwgt-member-exception-cell';
        cell.style.textAlign = 'center';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.title = 'Check to use exception handling for this member in the displayed category.';
        checkbox.addEventListener('change', () => {
            const groupId = activeGroup();
            if (!data.settings.exceptions[memberId]) data.settings.exceptions[memberId] = {};
            if (checkbox.checked) data.settings.exceptions[memberId][groupId] = true;
            else delete data.settings.exceptions[memberId][groupId];
            if (!Object.keys(data.settings.exceptions[memberId]).length) {
                delete data.settings.exceptions[memberId];
            }
            HWGT_saveMemberTrackerData(data);
        });
        memberCheckboxes.set(memberId, checkbox);
        cell.appendChild(checkbox);
        row.appendChild(cell);
    });

    const syncMemberExceptionColumn = () => {
        const groupId = activeGroup();
        memberCheckboxes.forEach((checkbox, memberId) => {
            checkbox.checked = HWGT_memberIsExcepted(data.settings, memberId, groupId);
            checkbox.setAttribute(
                'aria-label',
                `${members[memberId]?.name || `#${memberId}`} exception for ${HWGT_MEMBER_GROUPS[groupId].label}`
            );
        });
    };
    navItems.forEach(item => item.addEventListener('click', () => {
        setTimeout(syncMemberExceptionColumn, 0);
    }));
    syncMemberExceptionColumn();
})();

/* ===== Gang Member Stat Tracker classification sources ===== */
(function () {
    'use strict';

    if (!HWGT_isModuleEnabled('member-stats')) return;
    const params = new URLSearchParams(location.search);
    if (params.get('cmd') !== 'gang') return;

    const cleanText = value => String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const profileId = anchor => String(anchor?.href.match(/[?&]ID=(\d+)/i)?.[1] || '');
    const now = Date.now();
    const data = HWGT_loadMemberTrackerData();
    let changed = false;

    const whitelistTable = document.querySelector('table#whitelist');
    if (whitelistTable) {
        const listed = new Map();
        whitelistTable.querySelectorAll('tbody tr').forEach(row => {
            const anchor = row.querySelector('a[href*="cmd=player"][href*="ID="]');
            const memberId = profileId(anchor);
            if (!memberId) return;
            const selectedTitle = row.querySelector('select option:checked, select option[selected]');
            listed.set(memberId, {
                name: cleanText(anchor.textContent) || `#${memberId}`,
                profileUrl: anchor.href || '',
                title: cleanText(selectedTitle?.textContent).replace(/^-None-$/, '')
            });
        });

        Object.values(data.catalog.members).forEach(member => {
            const classifications = member.classifications || (member.classifications = {});
            if (classifications.whitelist) classifications.whitelist = false;
            delete member.whitelistTitle;
        });
        listed.forEach((entry, memberId) => {
            const member = data.catalog.members[memberId] || {};
            data.catalog.members[memberId] = {
                ...member,
                name: entry.name,
                profileUrl: entry.profileUrl || member.profileUrl || '',
                classifications: { ...(member.classifications || {}), whitelist: true },
                whitelistTitle: entry.title,
                firstSeenAt: member.firstSeenAt || now,
                classificationCapturedAt: {
                    ...(member.classificationCapturedAt || {}),
                    whitelist: now
                }
            };
        });
        data.sources = { ...(data.sources || {}), whitelistCapturedAt: now };
        changed = true;
    }

    const content = document.querySelector('.content-area');
    const labels = Array.from(content?.querySelectorAll('b, strong') || []);
    const findLabel = wanted => labels.find(node =>
        cleanText(node.textContent).replace(/:$/, '').toLowerCase() === wanted.toLowerCase()
    );
    const linksAfter = label => {
        const links = [];
        let node = label?.nextSibling;
        while (node && node.nodeName !== 'BR') {
            if (node.nodeType === 1) {
                if (node.matches?.('a[href*="cmd=player"][href*="ID="]')) links.push(node);
                links.push(...Array.from(node.querySelectorAll?.('a[href*="cmd=player"][href*="ID="]') || []));
            }
            node = node.nextSibling;
        }
        return links;
    };

    const leaderLabel = findLabel('Leader');
    const ownerLabel = findLabel('Owner');
    const councilLabel = findLabel('Leadership Council');
    const basicInfoLabel = Array.from(content?.querySelectorAll('u') || [])
        .some(node => cleanText(node.textContent).replace(/:$/, '') === 'Basic Info');

    if (basicInfoLabel && leaderLabel && ownerLabel && councilLabel) {
        const allLinks = Array.from(content.querySelectorAll('a[href*="cmd=player"][href*="ID="]'));
        const roster = new Map();
        allLinks.forEach(anchor => {
            const memberId = profileId(anchor);
            if (memberId) roster.set(memberId, {
                name: cleanText(anchor.textContent) || `#${memberId}`,
                profileUrl: anchor.href || ''
            });
        });
        const leaders = new Set(linksAfter(leaderLabel).map(profileId).filter(Boolean));
        const owners = new Set(linksAfter(ownerLabel).map(profileId).filter(Boolean));
        const council = new Set(linksAfter(councilLabel).map(profileId).filter(Boolean));
        const staff = new Set([...leaders, ...owners, ...council]);

        Object.entries(data.catalog.members).forEach(([memberId, member]) => {
            const classifications = member.classifications || (member.classifications = {});
            if (classifications.gangMember && !roster.has(memberId)) {
                classifications.gangMember = false;
                classifications.formerMember = true;
                classifications.leadershipCouncil = false;
                classifications.gangStaff = false;
                member.membershipState = 'former';
                member.leftAt = member.leftAt || now;
            }
        });

        roster.forEach((entry, memberId) => {
            const member = data.catalog.members[memberId] || {};
            data.catalog.members[memberId] = {
                ...member,
                name: entry.name,
                profileUrl: entry.profileUrl || member.profileUrl || '',
                membershipState: 'current',
                classifications: {
                    ...(member.classifications || {}),
                    leadershipCouncil: council.has(memberId),
                    gangStaff: staff.has(memberId),
                    gangMember: true,
                    formerMember: false
                },
                firstSeenAt: member.firstSeenAt || now,
                lastSeenAt: now,
                classificationCapturedAt: {
                    ...(member.classificationCapturedAt || {}),
                    information: now
                }
            };
            delete data.catalog.members[memberId].leftAt;
        });
        data.sources = { ...(data.sources || {}), informationCapturedAt: now };
        changed = true;
    }

    if (changed) HWGT_saveMemberTrackerData(data);
})();
