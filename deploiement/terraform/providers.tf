# ==========================================================
# Providers Terraform
# ----------------------------------------------------------
# La VM Ubuntu est créée manuellement sous UTM (Mac Apple
# Silicon) : le provider vSphere exige un ESXi/vCenter x86,
# indisponible ici (cf. cahier des charges, section 4.2).
# Terraform gère donc les ressources réellement disponibles :
# vérification de l'accès SSH et génération de l'inventaire
# Ansible.
# ==========================================================
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "local" {}
