#!/usr/bin/env node
'use strict'

//override env
process.env.TIMESTAMP = Date.now();

const util = require('util');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const replaceString = require('replace-string');
const YAML = require('yamljs');
const merge = require('deepmerge')

const Termoil = require('termoil');

const KTM = new Termoil;

KTM.name('Kube TPL Manager');
KTM.instructions('ktm [tpl_path] [config_path]');
KTM.addVersion(new Termoil.Version('1.0', true))
KTM.addOption(
  new Termoil.Option(
    '0', 'tplPath', new Termoil.Option.Type('value', true), 'Location of template'
  )
);
KTM.addOption(
  new Termoil.Option(
    '1', 'configPath', new Termoil.Option.Type('value', true), 'Location of config', 'ktm-config.yml'
  )
);
KTM.addOption(
  new Termoil.Option(
    ['-b', '-B', '--branch'], 'branch', new Termoil.Option.Type('value', true), 'Location of template', 'ktm-config.yml'
  )
);

KTM.addOption(
  new Termoil.Option(
    ['-t', '-T', '--test'], 'test', new Termoil.Option.Type('flag'), 'Test mode'
  )
);

KTM.addOption(
  new Termoil.Option(
    ['-n', '-N', '--service-account-name'], 'serviceAccountName', new Termoil.Option.Type('value', true), 'Service Account Key Path'
  )
);

KTM.addOption(
  new Termoil.Option(
    ['-k', '-K', '--service-account-key'], 'serviceAccountKey', new Termoil.Option.Type('value', true), 'Service Account Key Path', 'service-account.json'
  )
);

KTM.addOption(
  new Termoil.Option(
    ['-p', '-P', '--project'], 'project', new Termoil.Option.Type('value', true), 'Cluster Project Id'
  )
);


KTM.on('parsed', function () {
  const serviceAccount = JSON.parse(fs.readFileSync(this.get('serviceAccountKey')).toString()); 
  // Activate Service Account
  const gcloudAuth = spawnSync('gcloud', [
    'auth', 
    'activate-service-account',
    (this.get('serviceAccountName') ? this.get('serviceAccountName') : serviceAccount.client_email),
    util.format('--key-file=%s', this.get('serviceAccountKey'))
  ]);
  process.stderr.write(gcloudAuth.stderr.toString());
  process.stdout.write(gcloudAuth.stdout.toString());
  // If we fail to auth kill the app
  if (gcloudAuth.status !== 0) {
    process.exit(1);
  }
  
  const branch = this.get('branch');
  const config = YAML.parse(fs.readFileSync(path.resolve(process.cwd(), this.get('configPath'))).toString());
  for (let branchConfig of config.branches[branch]) {
    const deploymentConfig = merge(config.defaults, branchConfig);
    // Activate Cluster Config
    const clusterConfig = spawnSync('gcloud', [
      'container',
      'clusters',
      'get-credentials',
      deploymentConfig.cluster,
      '--zone',
      deploymentConfig.zone,
      '--project',
      (this.get('project') ? this.get('project') : serviceAccount.project_id)
    ]);
    process.stderr.write(clusterConfig.stderr.toString());
    process.stdout.write(clusterConfig.stdout.toString());
    // If we fail to config the cluster kill the app
    if (clusterConfig.status !== 0) {
      process.exit(1);
    }
    let tpls = '';
    for (let tpl of deploymentConfig.configs) {
      tpls += fs.readFileSync(path.resolve(process.cwd(), this.get('tplPath'))).toString();
    }
    for (let replacementKey in deploymentConfig.replace) {
      let replacement = deploymentConfig.replace[replacementKey];
      if (replacement.constructor === Array) {
        let updatedReplacement = '';
        for (let i=0; i<replacement.length; i++) {
          const replacementSegment = replacement[i];
          if (replacementSegment.match("\\$")) {
            updatedReplacement += process.env[replacementSegment.substring(1)];
          } else if (replacementSegment.match("\\%")) { 
            updatedReplacement += deploymentConfig[replacementSegment.substring(1)];
          } else {
            updatedReplacement += replacementSegment;
          }
        }
        replacement = updatedReplacement;
      }
      tpls = replaceString(tpls, replacementKey, replacement, "g");
    }
    if (this.get('test') === true) {
      process.stdout.write("CONFIG:\n" + JSON.stringify(deploymentConfig, null, 4) + "\n");
      process.stdout.write(['kubectl', util.format('--namespace=%s', deploymentConfig.namespace), 'apply', '-f', '-'].join(' '));
    } else {
      const deployment = spawn('kubectl', [util.format('--namespace=%s', deploymentConfig.namespace), 'apply', '-f', '-']);
      deployment.stdin.write(tpls);
      deployment.stdout.on('data', stdout => { process.stdout.write(stdout.toString());  });
      deployment.stderr.on('data', stderr  => { process.stderr.write(stderr.toString()); });
      deployment.stdin.end();
      deployment.on('close', deployStatusCode => {
        if (deployStatusCode === 0) {
          for (let deploymentName of deploymentConfig.status) {
            const rolloutStatus = spawn('kubectl', [util.format('--namespace=%s', deploymentConfig.namespace), 'rollout', 'status', deploymentName]);
            rolloutStatus.stdout.on('data', stdout => { process.stdout.write(stdout.toString());  });
            rolloutStatus.stderr.on('data', stderr  => { process.stderr.write(stderr.toString()); });
            rolloutStatus.on('close', rolloutStatusCode => {
              if (rolloutStatusCode === 0) {
                process.stdout.write(util.format('Deployment %s rolled out!', deploymentName));
              } else {
                process.stderr.write(util.format('Deployment %s failed!', deploymentName));
                process.exit(1);
              }
            });
          }
        }
      });
    }
    process.stdout.write("\nSTDIN:\n" + tpls);
  }
});

KTM.parse(Termoil.Skip(process.argv, 2));
