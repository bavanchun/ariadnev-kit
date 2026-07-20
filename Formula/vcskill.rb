# Homebrew formula for vcskill. Lives in the tap repo bavanchun/homebrew-vcskill
# (copy this file to Formula/vcskill.rb there). Install with:
#
#   brew install bavanchun/vcskill/vcskill
#
# Bump `version` and the two `sha256` values on each release — they come from the
# GitHub Release's checksums.txt (the vcskill-darwin-arm64 / -x64 lines).
class Vcskill < Formula
  desc "Author agent skills once, install to any AI provider — standalone binary"
  homepage "https://github.com/bavanchun/vcskill"
  version "0.5.0" # UPDATE per release
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/bavanchun/vcskill/releases/download/vcskill@#{version}/vcskill-darwin-arm64"
      sha256 "REPLACE_WITH_DARWIN_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/bavanchun/vcskill/releases/download/vcskill@#{version}/vcskill-darwin-x64"
      sha256 "REPLACE_WITH_DARWIN_X64_SHA256"
    end
  end

  def install
    bin.install Dir["vcskill-*"].first => "vcskill"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/vcskill --version")
  end
end
