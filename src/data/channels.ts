/**
 * Real promotional channels from spec §13. Pricing rules are dated rule
 * statements — SHOWTIME does not estimate a cost per ticket for any platform.
 * Integration is `link-only` for all of them: no account is connected.
 */
import type { MarketingChannel } from '../domain/types';

const CHECKED = '2026-11-08T00:00:00Z';

export const channels: MarketingChannel[] = [
  {
    id: 'ch-google-ads',
    name: 'Google Ads (Search, YouTube, Display)',
    kind: 'search_video',
    officialUrl: 'https://business.google.com/us/resources/articles/how-much-google-ads-cost/',
    docsUrl: 'https://developers.google.com/google-ads/api/docs/get-started/introduction',
    regions: 'Global (account-dependent)',
    formats: 'Search, video, display',
    pricingRule: 'No universal fixed cost. Advertiser sets the budget; costs are auction- and goal-dependent (Google guidance, Sept 2026).',
    ruleCheckedAt: CHECKED,
    integration: 'link-only',
    caveat: 'API access requires an approved developer token and OAuth; access level governs permissible use.',
  },
  {
    id: 'ch-meta-ads',
    name: 'Meta Ads (Facebook / Instagram)',
    kind: 'paid_social',
    officialUrl: 'https://www.facebook.com/business/ads',
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis/',
    regions: 'Global (account-dependent)',
    formats: 'Feed, Stories, Reels',
    pricingRule: 'Variable auction cost; budgets are not the same as observed ad costs. No fixed guaranteed CPC.',
    ruleCheckedAt: CHECKED,
    integration: 'link-only',
    caveat: 'Marketing API only with approved app scopes.',
  },
  {
    id: 'ch-tiktok-ads',
    name: 'TikTok Ads',
    kind: 'paid_social',
    officialUrl: 'https://ads.tiktok.com/resources/help/article/budget-and-bidding-faq',
    regions: 'Region/account dependent',
    formats: 'Short-form video',
    pricingRule: 'TikTok publishes minimum campaign and ad-group budgets (FAQ updated Aug 2026). Minimums change and are region/account dependent — read the current figure at source.',
    ruleCheckedAt: CHECKED,
    integration: 'link-only',
    caveat: 'SHOWTIME has not stored the minimum figures; check the official FAQ before planning.',
  },
  {
    id: 'ch-ticketmaster-discovery',
    name: 'Ticketmaster Discovery API',
    kind: 'event_listing',
    officialUrl: 'https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/',
    regions: 'Ticketmaster markets',
    formats: 'Event, attraction and venue lookup',
    pricingRule: 'Developer API with account-specific rate policy. Not a ticketing or publishing write API.',
    ruleCheckedAt: CHECKED,
    integration: 'link-only',
    caveat: 'Useful for comparable-event research; not a substitute for venue plans or talent contacts.',
  },
  {
    id: 'ch-eventbrite',
    name: 'Eventbrite',
    kind: 'event_listing',
    officialUrl: 'https://www.eventbrite.com/',
    regions: 'Global',
    formats: 'Event listing and ticketing',
    pricingRule: 'Ticketing fees per Eventbrite\'s published pricing for your country — not stored here; read at source.',
    ruleCheckedAt: CHECKED,
    integration: 'link-only',
    caveat: 'Write API availability must be verified against current developer policy.',
  },
];

export const channelById = (id: string) => channels.find((c) => c.id === id);
