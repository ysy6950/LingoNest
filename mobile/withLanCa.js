const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withLanCa(config) {
  config = withAndroidManifest(config, (result) => {
    result.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/lingonest_network_security';
    return result;
  });
  return withDangerousMod(config, ['android', async (result) => {
    const resources = path.join(result.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    await fs.mkdir(path.join(resources, 'raw'), { recursive: true });
    await fs.mkdir(path.join(resources, 'xml'), { recursive: true });
    await fs.copyFile(
      path.join(result.modRequest.projectRoot, 'assets', 'lingonest-lan-ca.pem'),
      path.join(resources, 'raw', 'lingonest_lan_ca.pem'),
    );
    await fs.writeFile(path.join(resources, 'xml', 'lingonest_network_security.xml'), [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<network-security-config>',
      '  <base-config cleartextTrafficPermitted="false">',
      '    <trust-anchors>',
      '      <certificates src="system" />',
      '      <certificates src="@raw/lingonest_lan_ca" />',
      '    </trust-anchors>',
      '  </base-config>',
      '</network-security-config>',
      '',
    ].join('\n'));
    return result;
  }]);
};
