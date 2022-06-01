# Is it Observable
<p align="center"><img src="/image/logo.png" width="40%" alt="Is It observable Logo" /></p>

## Episode dedicated to K6
<p align="center"><img src="/image/k6.png" width="40%" alt="k6 Logo" /></p>
This repository contains the files utilized during the tutorial presented in the dedicated IsItObservable episode related to k6
What you will learn
* How to deploy the k6 operator
* How to create a custom k6 image with additionnal extensions
* How to design an http and grpc k6 script
* How to deploy a k6 test using the k6 operator

This repository showcase the usage of the k6 by using GKE with :
* the HipsterShop
* Prometheus
* Nginx ingress controller
* OpenTelemety Operator
* Dynatrace



## Prerequisite
The following tools need to be install on your machine :
- jq
- kubectl
- git
- gcloud ( if you are using GKE)
- Helm
- go
- gcc
- kustomize
- k6 client installed

If you don't have any dynatrace tenant , then let's start a [trial on Dynatrace](https://www.dynatrace.com/trial/)


## Deployment Steps in GCP 

You will first need a Kubernetes cluster with 2 Nodes.
You can either deploy on Minikube or K3s or follow the instructions to create GKE cluster:
### 1.Create a Google Cloud Platform Project
```
PROJECT_ID="<your-project-id>"
gcloud services enable container.googleapis.com --project ${PROJECT_ID}
gcloud services enable monitoring.googleapis.com \
    cloudtrace.googleapis.com \
    clouddebugger.googleapis.com \
    cloudprofiler.googleapis.com \
    --project ${PROJECT_ID}
```
### 2.Create a GKE cluster
```
ZONE=us-central1-b
gcloud container clusters create onlineboutique \
--project=${PROJECT_ID} --zone=${ZONE} \
--machine-type=e2-standard-2 --num-nodes=4
```

### 3.Clone the Github Repository
```
git clone https://github.com/observe-k8s/Observe-k8s-demo
cd Observe-k8s-demo
```
### 4.Deploy Nginx Ingress Controller
```
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```
this command will install the nginx controller on the nodes having the label `observability`

#### 1. get the ip adress of the ingress gateway
Since we are using Ingress controller to route the traffic , we will need to get the public ip adress of our ingress.
With the public ip , we would be able to update the deployment of the ingress for :
* hipstershop
* grafana
* K6
```
IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -ojson | jq -j '.status.loadBalancer.ingress[].ip')
```

update the following files to update the ingress definitions :
```
sed -i "s,IP_TO_REPLACE,$IP," kubernetes-manifests/k8s-manifest.yaml
sed -i "s,IP_TO_REPLACE,$IP," grafana/ingress.yaml
sed -i "s,IP_TO_REPLACE,$IP," k6/loadgenerator.js
sed -i "s,IP_TO_REPLACE,$IP," k6/loadgenerator_distributedtracing.js
```

### 5.Prometheus
#### 1.Deploy

```
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/kube-prometheus-stack --set sidecar.datasources.enabled=true --set sidecar.datasources.label=grafana_datasource --set sidecar.datasources.labelValue="1" --set sidecar.dashboards.enabled=true
```
#### 2. Configure Prometheus by enabling the feature remote-writer

To measure the impact of our experiments on use traffic , we will use the load testing tool named K6.
K6 has a Prometheus integration that writes metrics to the Prometheus Server.
This integration requires to enable a feature in Prometheus named: remote-writer

To enable this feature we will need to edit the CRD containing all the settings of promethes: prometehus

To get the Prometheus object named use by prometheus we need to run the following command:
```
kubectl get Prometheus
```
here is the expected output:
```
NAME                                    VERSION   REPLICAS   AGE
prometheus-kube-prometheus-prometheus   v2.32.1   1          22h
```
We will need to add an extra property in the configuration object :
```
enableFeatures:
- remote-write-receiver
```
so to update the object :
```
kubectl edit Prometheus prometheus-kube-prometheus-prometheus
```
After the update your Prometheus object should look  like :
```
apiVersion: monitoring.coreos.com/v1
kind: Prometheus
metadata:
  annotations:
    meta.helm.sh/release-name: prometheus
    meta.helm.sh/release-namespace: default
  generation: 2
  labels:
    app: kube-prometheus-stack-prometheus
    app.kubernetes.io/instance: prometheus
    app.kubernetes.io/managed-by: Helm
    app.kubernetes.io/part-of: kube-prometheus-stack
    app.kubernetes.io/version: 30.0.1
    chart: kube-prometheus-stack-30.0.1
    heritage: Helm
    release: prometheus
  name: prometheus-kube-prometheus-prometheus
  namespace: default
spec:
  alerting:
  alertmanagers:
  - apiVersion: v2
    name: prometheus-kube-prometheus-alertmanager
    namespace: default
    pathPrefix: /
    port: http-web
  enableAdminAPI: false
  enableFeatures:
  - remote-write-receiver
  externalUrl: http://prometheus-kube-prometheus-prometheus.default:9090
  image: quay.io/prometheus/prometheus:v2.32.1
  listenLocal: false
  logFormat: logfmt
  logLevel: info
  paused: false
  podMonitorNamespaceSelector: {}
  podMonitorSelector:
  matchLabels:
  release: prometheus
  portName: http-web
  probeNamespaceSelector: {}
  probeSelector:
  matchLabels:
  release: prometheus
  replicas: 1
  retention: 10d
  routePrefix: /
  ruleNamespaceSelector: {}
  ruleSelector:
  matchLabels:
  release: prometheus
  securityContext:
  fsGroup: 2000
  runAsGroup: 2000
  runAsNonRoot: true
  runAsUser: 1000
  serviceAccountName: prometheus-kube-prometheus-prometheus
  serviceMonitorNamespaceSelector: {}
  serviceMonitorSelector:
  matchLabels:
  release: prometheus
  shards: 1
  version: v2.32.1
```


#### 4. Get The Prometheus serice
```
PROMETHEUS_SERVER=$(kubectl get svc -l app=kube-prometheus-stack-prometheus -o jsonpath="{.items[0].metadata.name}")
```

### 6. Deploy the Opentelemetry Operator

#### Deploy the cert-manager
```
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.6.1/cert-manager.yaml
```
#### Wait for the service to be ready
```
kubectl get svc -n cert-manager
```
After a few minutes, you should see:
```
NAME                   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
cert-manager           ClusterIP   10.99.253.6     <none>        9402/TCP   42h
cert-manager-webhook   ClusterIP   10.99.253.123   <none>        443/TCP    42h
```

#### Deploy the OpenTelemetry Operator
```
kubectl apply -f https://github.com/open-telemetry/opentelemetry-operator/releases/latest/download/opentelemetry-operator.yaml
```

### 7. Configure the OpenTelemetry Collector

#### Create the API token in Dynatrace
Follow the instruction described in [dynatrace's documentation](https://www.dynatrace.com/support/help/shortlink/api-authentication#generate-a-token)
Make sure that the following scope are selected :
- Data Ingest
* Ingest metrics
* Ingest OpenTelemetry traces
- Operator:
* Read configuration
* Write configuration
* Read settings
* write settings
* read entities
* installer downloade
* Access problem and events
<p align="center"><img src="/image/apitoken.png" width="60%" alt="dt api scope" /></p>

####  update the deployment file
```
export ENVIRONMENT_URL_TO_REPLACE = environment url ( without https)
export DT_API_TOKEN_OPERATOR =" your token"
export DT_API_TOKEN_INGEST=""
DT_API_TOKEN_OPERATOR_encoded=$(echo $DT_API_TOKEN_OPERATOR| base64 -e )
DT_API_TOKEN_INGEST_encoded=$(echo $DT_API_TOKEN_INGEST| base64 -e )
sed -i "s,ENVIRONMENT_URL_TO_REPLACE,$ENVIRONMENT_URL," dynatrace/dynakube.yaml
sed -i "s,DT_API_TOKEN_OPERATOR_TOREPLACE,$DT_API_TOKEN_OPERATOR_encoded," dynatrace/dynakube.yaml
sed -i "s,DT_API_TOKEN_INGEST_TOREPLACE,$DT_API_TOKEN_INGEST_encoded," dynatrace/dynakube.yaml
```


##### Create a secret holding the environment URL and login credentials for this registry
```
kubectl create namespace dynatrace
kubectl apply -f https://github.com/Dynatrace/dynatrace-operator/releases/download/v0.6.0/kubernetes.yaml
kubectl -n dynatrace wait pod --for=condition=ready --selector=app.kubernetes.io/name=dynatrace-operator,app.kubernetes.io/component=webhook --timeout=300s
kubectl apply -f dynatrace/dynakube.yaml
 ```
##### Update manifest file 
Update the file named  activegate.yaml, by running the following command :
 ```
sed -i "s,TENANTURL_TOREPLACE,$ENVIRONMENT_URL," kubernetes-manifests/openTelemetry-manifest.yaml
sed -i "s,TENANTURL_TOREPLACE,$ENVIRONMENT_URL," k6/k6loadtest.yaml
sed -i "s,TENANTURL_TOREPLACE,$ENVIRONMENT_URL," k6/k6component.yaml
sed -i "s,DT_API_TOKEN_TO_REPLACE,$DT_API_TOKEN_INGEST," kubernetes-manifests/openTelemetry-manifest.yaml
sed -i "s,DT_API_TOKEN_TO_REPLACE,$DT_API_TOKEN_INGEST," k6/k6loadtest.yaml
sed -i "s,DT_API_TOKEN_TO_REPLACE,$DT_API_TOKEN_INGEST," k6/k6component.yaml
CLUSTERID=$(kubectl get namespace kube-system -o jsonpath='{.metadata.uid}')
sed -i "s,CLUSTER_ID_TOREPLACE,$CLUSTERID," kubernetes-manifests/openTelemetry-manifest.yaml
```


### 7. Deploy the k6 Operator
```
git clone https://github.com/grafana/k6-operator && cd k6-operator
make deploy
make install
```

### 8. Deploy the k6 test

#### Build the customized k6 image
```
docker build -f Dockerfileprom -t hrexed/k6-prometheus-distributedtracing:0.1
```
#### Deploy the the k6 scripts
```
kubectl create ns k6
kubectl create configmap k6-test --from-file=k6/loadgenerator.js --from-file=k6/loadgenerator_distributedtracing.js -n k6
cd k6
k6 archive component_testing.js
cd ..
kubectl create configmap k6-test --from-file=k6/archive.tar -n hipster-shop
```

### 9. Deploy the OpenTelemetry Collector
```
kubectl apply -f kubernetes-manifests/openTelemetry-manifest.yaml
```

### 10. Deploy the hipstershop
```
kubectl create ns hipster-shop
kubectl apply -n hipster-shop -f kubernetes-manifests/k8s-manifest.yaml
```
### 11. Deploy the K6 tests

In this tutorial we have 2 different scripts :
- 1. Script generating load against one of the micro services of the hipster-shop : productcatalog
  this script showcase the design of k6 test using the grpc protocol
  
- 2. Script generating the load against the frontend of the hipstershop
    this script showcase the design of a k6 script using the http protocol

#### grpc test     
Let's first test the component level script ( using grpc)
```
kubectl apply -n k6 -f k6/k6component.yaml -n hipster-shop
```

Let's have a look a the logs produced by the k6 tests.

#### http test
```
kubectl apply -n hipster-shop -f k6/k6loadtest.yaml -n k6
```
#### Distributed tracing
```
kubectl apply -n hipster-shop -f k6/k6loadtest._prom_distributed.yaml -n k6
```
### 13 [Optional] **Clean up**: TODO
```
gcloud container clusters delete onlineboutique \
    --project=${PROJECT_ID} --zone=${ZONE}
```




