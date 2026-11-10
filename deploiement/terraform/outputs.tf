output "server_ip" {
  description = "Adresse IP du serveur de déploiement"
  value       = var.server_ip
}

output "ssh_command" {
  description = "Commande de connexion SSH"
  value       = "ssh -i ${var.ssh_private_key_path} ${var.ssh_user}@${var.server_ip}"
}

output "api_urls" {
  description = "URL de santé de l'API par environnement"
  value = {
    for env, port in var.environments :
    env => "http://${var.server_ip}:${port}/v1/health"
  }
}

output "ansible_inventory" {
  description = "Inventaire Ansible généré"
  value       = abspath(local_file.ansible_inventory.filename)
}
