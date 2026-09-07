const {
  authenticateResult,
  AUTH_RESULT_SUCCESS,
} = require("ldap-authentication");
const fs = require("fs");
const bcrypt = require("bcryptjs");

/**
 * Safely extract environment variables, trimming whitespace and removing outer quotes.
 */
function getEnv(key, defaultValue = "") {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return defaultValue;
  let str = String(raw).trim();
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }
  if (str.includes("$$")) {
    str = str.replace(/\$\$/g, "$");
  }
  return str;
}

/**
 * Safely parse boolean environment variables.
 */
function getEnvBool(key, defaultValue = false) {
  const val = getEnv(key).toLowerCase();
  if (!val) return defaultValue;
  return val === "true" || val === "1" || val === "yes";
}

// Load configuration from environment variables
const config = {
  useLdap: getEnvBool("NODE_RED_USE_LDAP", false),
  ldapServer: getEnv("NODE_RED_LDAP_SERVER"),
  ldapBindDn: getEnv("NODE_RED_LDAP_BIND_DN"),
  ldapBindPassword: getEnv("NODE_RED_LDAP_BIND_PASSWORD"),
  ldapUseTls: getEnvBool("NODE_RED_LDAP_USE_TLS", false),
  ldapBypassTlsVerify: getEnvBool("NODE_RED_LDAP_BYPASS_TLS_VERIFY", false),
  ldapCaCertFile: getEnv("NODE_RED_LDAP_CA_CERT_FILE"),
  ldapUserSearchBase: getEnv("NODE_RED_LDAP_USER_SEARCH_BASE"),
  ldapUsernameAttribute: getEnv(
    "NODE_RED_LDAP_USERNAME_ATTRIBUTE",
    "sAMAccountName",
  ),
  ldapUserFilter: getEnv("NODE_RED_LDAP_USER_FILTER"),
  adminUsername: getEnv("NODE_RED_ADMIN_USERNAME"),
  adminPasswordHash: getEnv("NODE_RED_ADMIN_PASSWORD_HASH"),
};

/**
 * Build TLS options based on configuration
 */
function buildLdapTlsOptions() {
  const tlsOptions = {};

  if (!config.ldapServer) return tlsOptions;

  // Extract hostname from LDAP server URL for SNI
  try {
    const url = new URL(config.ldapServer);
    tlsOptions.servername = url.hostname;
  } catch (e) {
    // If URL parsing fails, attempt to extract hostname manually
    const match = config.ldapServer.match(/ldaps?:\/\/([^:/?]+)/);
    if (match) {
      tlsOptions.servername = match[1];
    }
  }

  // Handle certificate verification
  if (config.ldapBypassTlsVerify) {
    console.warn(
      "[LDAP] TLS verification is DISABLED - not recommended for production",
    );
    tlsOptions.rejectUnauthorized = false;
  } else {
    tlsOptions.rejectUnauthorized = true;

    // Load CA certificate if specified
    if (config.ldapCaCertFile) {
      try {
        if (fs.existsSync(config.ldapCaCertFile)) {
          const caCert = fs.readFileSync(config.ldapCaCertFile);
          tlsOptions.ca = [caCert];
          console.log(
            `[LDAP] Using CA certificate from ${config.ldapCaCertFile}`,
          );
        } else {
          console.warn(
            `[LDAP] CA certificate file not found: ${config.ldapCaCertFile}`,
          );
        }
      } catch (error) {
        console.error(`[LDAP] Failed to read CA certificate: ${error.message}`);
      }
    }
  }

  return tlsOptions;
}

/**
 * Authenticate user against LDAP server
 */
async function authenticateWithLdap(username, password) {
  try {
    if (!config.ldapServer || !config.ldapBindDn || !config.ldapBindPassword) {
      console.error(
        "[LDAP] Missing required LDAP configuration (server, bind DN, or password)",
      );
      return null;
    }

    if (!config.ldapUserSearchBase) {
      console.error("[LDAP] Missing LDAP user search base configuration");
      return null;
    }

    const ldapOptions = {
      ldapOpts: {
        url: config.ldapServer,
        tlsOptions: buildLdapTlsOptions(),
        connectTimeout: 10000,
      },
      adminDn: config.ldapBindDn,
      adminPassword: config.ldapBindPassword,
      userPassword: password,
      userSearchBase: config.ldapUserSearchBase,
      usernameAttribute: config.ldapUsernameAttribute,
      username: username,
      attributes: [
        "sAMAccountName",
        "displayName",
        "mail",
        "cn",
        "distinguishedName",
      ],
    };

    // Enable STARTTLS if configured
    if (config.ldapUseTls && config.ldapServer.startsWith("ldap://")) {
      ldapOptions.starttls = true;
    }

    // Apply custom LDAP user search filter (e.g. for Security Group restrictions)
    if (config.ldapUserFilter) {
      let filter = config.ldapUserFilter;

      // Convert placeholders like %u or ${username} to {{username}}
      if (filter.includes("%u")) {
        filter = filter.replace(/%u/g, "{{username}}");
      }
      if (filter.includes("${username}")) {
        filter = filter.replace(/\$\{username\}/g, "{{username}}");
      }

      // If no username placeholder or username attribute is present, wrap the filter
      if (
        !filter.includes("{{username}}") &&
        !filter.includes(config.ldapUsernameAttribute)
      ) {
        const formattedFilter = filter.startsWith("(") ? filter : `(${filter})`;
        filter = `(&(${config.ldapUsernameAttribute}={{username}})${formattedFilter})`;
      }

      console.log(`[LDAP] Using usernameFilter for '${username}': ${filter}`);
      ldapOptions.usernameFilter = filter;
    }

    const result = await authenticateResult(ldapOptions);

    if (result && result.code === AUTH_RESULT_SUCCESS) {
      console.log(`[LDAP] User '${username}' authenticated successfully`);
      return {
        username: username,
        displayName: result.user?.displayName || username,
        mail: result.user?.mail || "",
        permissions: "*", // Grant admin permissions to authenticated LDAP users
      };
    } else {
      const msgs =
        result && result.messages
          ? result.messages.join(", ")
          : "Unknown failure";
      console.warn(
        `[LDAP] Authentication failed for user '${username}': ${msgs}`,
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[LDAP] Authentication error for user '${username}': ${error.message}`,
    );
    return null;
  }
}

/**
 * Authenticate user against local credentials (fallback)
 */
function authenticateLocal(username, password) {
  if (
    !username ||
    !password ||
    !config.adminUsername ||
    !config.adminPasswordHash
  ) {
    return null;
  }

  if (username !== config.adminUsername) {
    return null;
  }

  // Check bcrypt hash
  try {
    if (bcrypt.compareSync(password, config.adminPasswordHash)) {
      return { username, permissions: "*" };
    }
  } catch (err) {
    console.error(`[Auth] Error verifying admin password hash: ${err.message}`);
  }

  return null;
}

module.exports = {
  type: "credentials",

  /**
   * Get user by username (called during user lookup)
   */
  users: async function (username) {
    if (!username || username.length === 0) {
      return null;
    }

    // Check local admin user first
    if (config.adminUsername && username === config.adminUsername) {
      return {
        username: config.adminUsername,
        permissions: "*",
      };
    }

    // If LDAP is enabled, return user record with permissions
    if (config.useLdap) {
      return {
        username: username,
        permissions: "*",
      };
    }

    return null;
  },

  /**
   * Authenticate user with username and password
   */
  authenticate: async function (username, password) {
    if (!username || !password) {
      return null;
    }

    // Try LDAP authentication first if enabled
    if (config.useLdap) {
      try {
        const ldapUser = await authenticateWithLdap(username, password);
        if (ldapUser) {
          return ldapUser;
        }
      } catch (error) {
        console.error(
          `[LDAP] Unexpected error during authentication: ${error.message}`,
        );
      }
    }

    // Fall back to local admin authentication
    const localUser = authenticateLocal(username, password);
    if (localUser) {
      console.log(`[Auth] User '${username}' authenticated as local admin`);
      return localUser;
    }

    // No valid authentication found
    console.warn(`[Auth] Authentication failed for user '${username}'`);
    return null;
  },

  /**
   * Return default user (anonymous access disabled)
   */
  default: async function () {
    return null;
  },
};
