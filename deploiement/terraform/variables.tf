# ==========================================================
# Variables – valeurs réelles dans terraform.tfvars (hors Git)
# ==========================================================

variable "server_name" {
  description = "Nom logique du serveur de déploiement"
  type        = string
  default     = "souverainrecrut-srv"
}

variable "server_ip" {
  description = "Adresse IP de la VM Ubuntu (réseau partagé UTM)"
  type        = string

  validation {
    condition     = can(regex("^\\d{1,3}(\\.\\d{1,3}){3}$", var.server_ip))
    error_message = "server_ip doit être une adresse IPv4 (ex. 192.168.64.2)."
  }
}

variable "ssh_user" {
  description = "Utilisateur SSH de la VM"
  type        = string
}

variable "ssh_private_key_path" {
  description = "Chemin local de la clé privée de déploiement (jamais commitée)"
  type        = string
  default     = "~/.ssh/souverainrecrut_deploy"
}

variable "environments" {
  description = "Environnements déployés sur le serveur et port exposé de l'API"
  type        = map(number)
  default = {
    staging = 4001
    prod    = 4000
  }
}
