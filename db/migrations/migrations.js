// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_panoramic_wendigo.sql';
import m0001 from './0001_silky_nightmare.sql';
import m0002 from './0002_clumsy_misty_knight.sql';
import m0003 from './0003_lying_sinister_six.sql';
import m0004 from './0004_perfect_juggernaut.sql';
import m0005 from './0005_redundant_stardust.sql';
import m0006 from './0006_striped_triathlon.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006
    }
  }
  