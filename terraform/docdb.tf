# ─────────────────────────────────────────────
# PHASE 2: DocumentDB
# ─────────────────────────────────────────────

resource "aws_docdb_subnet_group" "main" {
  name       = "foodiedash-docdb-subnet-group"
  subnet_ids = [aws_subnet.private_db_1.id, aws_subnet.private_db_2.id]
  tags = { Name = "foodiedash-docdb-subnet-group" }
}

resource "aws_docdb_cluster_parameter_group" "main" {
  family      = "docdb5.0"
  name        = "foodiedash-docdb-params"
  description = "FoodieDash DocumentDB parameter group"

  parameter {
    name  = "tls"
    value = "enabled"
  }
}

resource "aws_docdb_cluster" "main" {
  cluster_identifier              = "foodiedash-docdb-cluster"
  engine                          = "docdb"
  engine_version                  = "5.0.0"
  master_username                 = "foodiedashAdmin"
  master_password                 = var.docdb_master_password
  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.docdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  storage_encrypted               = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "foodiedash-docdb-final-snapshot"

  tags = { Name = "foodiedash-docdb-cluster" }
}

resource "aws_docdb_cluster_instance" "primary" {
  identifier         = "foodiedash-docdb-primary"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = "db.t3.medium"

  tags = { Name = "foodiedash-docdb-primary" }
}

resource "aws_docdb_cluster_instance" "replica" {
  identifier         = "foodiedash-docdb-replica"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = "db.t3.medium"

  tags = { Name = "foodiedash-docdb-replica" }
}
