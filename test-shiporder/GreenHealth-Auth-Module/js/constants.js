// 檔案路徑: GreenHealth-Auth-Module/js/constants.js

/**
 * @file Constants Module
 * @description Centralized constants for the application to avoid magic strings
 * and improve maintainability.
 */

/**
 * Application routes. Using constants for routes prevents typos
 * and makes it easy to update paths in one place.
 * @enum {string}
 */
export const ROUTES = {
    LOGIN: './login.html',
    DASHBOARD: './dashboard.html',
    PROFILE_SETUP: './profile-setup.html',
    // Add other routes here as they are created
    // e.g., ADDRESS_MANAGEMENT: './address.html'
};

/**
 * Supabase table names.
 * @enum {string}
 */
export const TABLE_NAMES = {
    PROFILES: 'profiles',
    ADDRESSES: 'addresses',
    // Add other table names here
};

/**
 * Supabase specific error codes.
 * @enum {string}
 */
export const SUPABASE_ERRORS = {
    // The code for when a select query with .single() finds no rows.
    NO_ROWS_FOUND: 'PGRST116',
};