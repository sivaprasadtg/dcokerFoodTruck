# Foodtruck Microservices — Cloud-Native App (Node.js + PostgreSQL + Kubernetes)

## Overview
This project demonstrates a microservices-based food ordering system, deployed first using Docker Compose and then on Kubernetes.
It includes three core services:

| Service           | Description                                          | Port   |
| ----------------- | ---------------------------------------------------- | ------ |
| **menu-service**  | Manages menu items (CRUD operations).                | `3000` |
| **order-service** | Handles order creation, listing, and status updates. | `4000` |
| **postgres**      | Central PostgreSQL database shared by both services. | `5432` |

Each service is built using Node.js, Express.js, and PostgreSQL, with full containerization and orchestration support.

## Prerequisites

| Tool                   | Version | Purpose                        |
| ---------------------- | ------- | ------------------------------ |
| **Docker Desktop**     | ≥ 4.28  | Container runtime & Kubernetes |
| **kubectl**            | ≥ 1.30  | Manage Kubernetes resources    |
| **Postman / curl**     | –       | API testing                    |
| **Node.js (optional)** | ≥ 18.x  | Local testing without Docker   |
  
If you need to run the postgresql db locally you need to install it and create DB with tables followed by update .env files with db user creds.  
This is not required if docker/K8s is used.

#### Enable Kubernetes in Docker Desktop under Settings → Kubernetes → Enable Kubernetes.

## Running Locally (Docker Compose)

Clone the repository
'https://github.com/sivaprasadtg/dockerFoodTruck.git'

## Environment variables (.env) for local expirements

Create these files (do not commit them):

**src/menu-service/.env**  
**src/order-service/.env**

These env files could look like for menu and order service respectively:  

> PORT=3000  
DB_HOST=localhost  
DB_PORT=5432  
DB_USER=******  
DB_PASSWORD=******  
DB_NAME=foodtruck  
NODE_ENV=development

> PORT=4000  
DB_HOST=localhost  
DB_PORT=5432  
DB_USER=******  
DB_PASSWORD=******  
DB_NAME=foodtruck  
MENU_URL=http://localhost:3000  
NODE_ENV=development

### Start all services and verify
``` docker compose up --build ```  
``` docker ps ```

You should see foodtruck-menu, order-service, and postgres running.

### Test endpoints

| API           | Method | Example                        |
| ------------- | ------ | ------------------------------ |
| List menu     | GET    | `http://localhost:3000/menu`   |
| Add menu item | POST   | `http://localhost:3000/menu`   |
| List orders   | GET    | `http://localhost:4000/orders` |
| Create order  | POST   | `http://localhost:4000/orders` |

### Stop services
``` docker compose down -v```

## Running on Kubernetes

### Create Namespace
```kubectl apply -f k8s/namespace.yaml```

### Create Secrets from .env.k8s & ConfigMap for DB  
```kubectl delete secret db-secret -n foodtruck --ignore-not-found```  
```kubectl create secret generic db-secret -n foodtruck --from-env-file=.env.k8s -n foodtruck```    
``` kubectl apply -n foodtruck -f k8s/db-init-configmap.yaml```  

# TO BE REMOVED:
``` kubectl apply -n foodtruck -f k8s/secret-db.yaml```  

### Deploy PostgreSQL and get all pods
```kubectl apply -n foodtruck -f k8s/postgres.yaml```  
```kubectl get pods -n foodtruck -w```

Wait until the pod postgres-0 is Running and 1/1 Ready.

### Deploy Application Services and check pods
```kubectl apply -n foodtruck -f k8s/menu.yaml```  
```kubectl apply -n foodtruck -f k8s/order.yaml```  
```kubectl get pods -n foodtruck -w```

Wait till you see 3 pods up and ready (1/1).

### If ingress is not enabled, install and apply NGINX Ingress Controller  
1.Use the cloud deploy for nginx  
```kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml```  

2.Wait till the pods in ingress-nginx namespace is ready by checking:  
```kubectl get pods -n ingress-nginx```  

3.Then apply the ingress:  
```kubectl apply -n foodtruck -f k8s\ingress.yaml```

Verify ingress in the namespace:  
```kubectl get ingress -n foodtruck```

## For accessing app outside the K8s with a better host name
### Add this line to your system hosts file 
- Location (C:\Windows\System32\drivers\etc\hosts on Windows):  
```127.0.0.1 foodtruck.local```  
- (Optional) Use ```kubectl get svc -n ingress-nginx``` to verify external-IP of the ingress service is mapped to localhost or 127.0.0.1.   
- (Optional) Verify the mapping use ```curl -v http://foodtruck.local```  

### Visit the services via browser or Postman:

| Endpoint                               | Description   |
| -------------------------------------- | ------------- |
| `http://foodtruck.local/menu`          | Menu service  |
| `http://foodtruck.local/orders`        | Order service |
| `http://foodtruck.local/menu/health`   | Health check  |
| `http://foodtruck.local/orders/health` | Health check  |

## Security: Using networkpolicy
As an additional measure to not allow anything but the 2 microservices to access the DB, a policy is defined in this yaml which when applied prevents un-allowed access.  
```kubectl apply -n foodtruck -f k8s\networkpolicy-db.yaml```  

## Horizontal Pod Autoscaling (HPA)  
To demonstrate dynamic scaling in Kubernetes, Horizontal Pod Autoscalers are defined for both microservices - menu and order.
These automatically adjust the number of running pods based on CPU utilization.

### To enable autoscaling  
With an idea of replicas being at least 1 and maximum 5:  
```kubectl autoscale deployment menu -n foodtruck --cpu-percent=80 --min=1 --max=5```  
```kubectl autoscale deployment order -n foodtruck --cpu-percent=80 --min=1 --max=5```

### Verify status for everything in the namespace
```kubectl get pods,svc,hpa -n foodtruck```

## Clean up after everything
```kubectl delete ns foodtruck```
