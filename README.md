# Kube TPL Manager
## Environment configs to optimize your K8s CI/CD workflow

*Prerequisites*
node 8+
kubectl cli

*Getting Started*

```
npm install -g kube-tpl-manager
```

_deployment.yml_

```
---
apiVersion: "extensions/v1beta1"
kind: "Deployment"
metadata:
  name: "[DEPLOYMENT_NAME]"
  annotations:
    kubernetes.io/change-cause: "[ROLLOUT_NOTE]"
  namespace: "[NAMESPACE]"
spec:
  progressDeadlineSeconds: 120
  replicas: 1
  template:
    metadata:
      labels:
        name: "[DEPLOYMENT_LABEL]"
    spec:
      containers:
        - image: "[DOCKER_IMAGE]"
          name: "[DEPLOYMENT_NAME]"
          env:
            -
              name: "NODE_ENV"
              value: "[NODE_ENV]"
          resources:
            requests:
              cpu: [REQUEST_CPU]
          ports:
            - containerPort: 3000
```

_config.yml_

```
---
defaults:
  name: my-application
  cluster: sites-cluster
  zone: us-central1-a
  replace:
    "[ROLLOUT_NOTE]": ["$CI_COMMITTER", "(", "$CI_COMMIT", "): ", "$CI_COMMIT_MESSAGE"]
    "[DEPLOYMENT_NAME]": ["%name"]
    "[DEPLOYMENT_LABEL]": ["%name"]
    "[NAMESPACE]": ["%namespace"]
    "[DOCKER_IMAGE]": ["repo/image:", "$CI_BRANCH", ".", "$CI_TIMESTAMP"]
    "[REQUEST_CPU]": "100m"
  status:
    - deployment/my-application
branches:
  "stage":
    - namespace: stage
      configs: ["deployment.yml"]
      replace:
        "[NODE_ENV]": "stage"
```

```
#ktm [path to kube yml] [path to config yml] [options]
ktm deployment.yml config.yml -b stage -k service_account.json
```

```
ktm -H # for manual
```

_More docs coming soon..._
