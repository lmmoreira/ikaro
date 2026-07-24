terraform {
  required_version = "~> 1.15"

  backend "gcs" {
    bucket = "ikaro-tfstate"
    prefix = "foundation/prod"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}
