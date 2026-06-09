// Sprint 42 — real, verified external tenant-help resources. The footer
// disclaimer tells users to "consult a tenant attorney or your local NJ
// legal-aid clinic"; these links deliver on that (human-in-the-loop). Every
// URL was verified live before adding — do not add an unverified link.

export const LEASELENS_TENANT_HELP = {
  label: 'Tenant help',
  links: [
    {
      id: 'lsnj',
      label: 'Legal Services of NJ',
      href: 'https://www.lsnjlaw.org/legal-topics/housing/landlord-tenant',
      note: 'Free civil legal aid + tenants’ rights manual',
    },
    {
      id: 'njcourts',
      label: 'NJ Courts: Landlord/Tenant',
      href: 'https://www.njcourts.gov/self-help/landlord-tenant',
      note: 'Court process, defenses, eviction self-help',
    },
    {
      id: 'njgov',
      label: 'NJ.gov renter help',
      href: 'https://www.nj.gov/basicneeds/housing/help-renter-tenant.shtml',
      note: 'State housing + rental-assistance resources',
    },
  ],
} as const;
