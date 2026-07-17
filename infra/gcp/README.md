# GCP operasyon altyapısı

Bu Terraform paketi günlük/aylık ayrı GCS bucket'larını, CMEK, ayrık servis hesaplarını, üç Cloud Run Job'u, Scheduler tetiklerini ve ilk aşama Monitoring alarmlarını oluşturur.

Secret kaynakları oluşturulur fakat secret değerleri Terraform state'ine yazılmaz. Değerleri dağıtımdan önce `gcloud secrets versions add` ile ayrı güvenli kanaldan ekleyin.

```sh
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Bucket Lock bu kodda özellikle `is_locked = false` kalır. Retention testi ve yedi günlük kabul sonrasında `ops/backup/runbook.md` izlenir.

İlk kurulumda Artifact Registry ve IAM kaynaklarını uygulayın, operasyon imajını `cloudbuild.ops.yaml` ile üretin, ardından `ops_image` değerini oluşan immutable commit etiketiyle vererek Job kaynaklarını uygulayın. Sonraki Cloud Build çalışmaları mevcut Job revision'larını günceller. Bucket kaynaklarında `prevent_destroy` açıktır; Bucket Lock ayrıca yalnız runbook'taki açık insan onayıyla yapılır.
