# Location identification

The address parser supports explicit street addresses, six-digit Indian postcodes, postcode-only follow-ups, WhatsApp location messages and coordinate-bearing Google Maps links. It never invents a city, state, house number or coordinate. Existing hardcoded locality overrides were removed.

For server-side address geocoding, configure GOOGLE_GEOCODING_API_KEY with a restricted Google Geocoding API key. Without this key, the system still parses addresses, generates search/navigation links and accepts customer-shared coordinates; it leaves unlocated addresses for review. No API key is included in browser responses.

Geocoding is a suggested map match, not proof that a courier can reach a building. Responses record their source, precision and confidence. Missing or conflicting postcodes, partial matches, timeouts and provider failures never become verified delivery addresses. A person must confirm the delivery details before dispatch. Existing previously saved guesses should be reviewed and replaced; they are no longer overwritten during reads.

Only enable external geocoding after arranging appropriate handling of customer delivery addresses with the provider. The public Nominatim endpoint was removed; it is not used for customer address processing. Google Maps links and embeds open a third-party maps service.

Provider documentation: https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding
Public Nominatim usage/privacy restrictions: https://operations.osmfoundation.org/policies/nominatim/

Tests: node --import ./web/test-loader.mjs --test web/location-service.test.mjs
