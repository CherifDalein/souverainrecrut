# ==========================================================
# Infrastructure SouverainRecrut – serveur de déploiement
# ==========================================================

locals {
  ssh_key_path = pathexpand(var.ssh_private_key_path)
}

# ----------------------------------------------------------
# 1. Vérification que le serveur est joignable en SSH par clé
#    (BatchMode : échoue au lieu de demander un mot de passe).
#    Relancée si l'IP ou l'utilisateur change.
# ----------------------------------------------------------
resource "terraform_data" "ssh_check" {
  triggers_replace = [var.server_ip, var.ssh_user]

  provisioner "local-exec" {
    command = <<-EOT
      ssh -i "${local.ssh_key_path}" \
          -o BatchMode=yes -o ConnectTimeout=10 \
          -o StrictHostKeyChecking=accept-new \
          ${var.ssh_user}@${var.server_ip} \
          'echo "SSH OK : $(hostname) – $(uname -m) – $(lsb_release -ds)"'
    EOT
  }
}

# ----------------------------------------------------------
# 2. Inventaire Ansible généré à partir des variables :
#    pont entre Terraform et Ansible.
# ----------------------------------------------------------
resource "local_file" "ansible_inventory" {
  filename        = "${path.module}/../ansible/inventory.ini"
  file_permission = "0644"

  content = templatefile("${path.module}/templates/inventory.ini.tftpl", {
    server_name  = var.server_name
    server_ip    = var.server_ip
    ssh_user     = var.ssh_user
    ssh_key_path = var.ssh_private_key_path
  })

  depends_on = [terraform_data.ssh_check]
}
